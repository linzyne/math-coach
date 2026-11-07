"""
수식 검증 서버 (FastAPI + SymPy). AI를 쓰지 않는 무료 자동 검사.

각 풀이 줄을 '처음 문제'와 비교해 해집합이 같은지 확인한다.
- 앞 줄이 아니라 처음 문제와 비교하므로, 앞에서 틀린 줄을 그대로 이어 쓴 줄도 틀림으로 잡힌다.
- 정답 풀이와 방법이 달라도 해가 같으면 맞음.

Vercel에서는 이 파일이 Python 서버리스 함수로 배포되고,
Next.js의 /api/py/* 요청이 여기로 전달된다 (next.config.ts 참고).
"""

from __future__ import annotations

import re
from typing import Literal, Optional

from fastapi import FastAPI
from pydantic import BaseModel
from sympy import Eq, EmptySet, S, Symbol, nsimplify, simplify, solveset
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    rationalize,
    standard_transformations,
)

TRANSFORMS = standard_transformations + (implicit_multiplication_application, convert_xor, rationalize)

# ---------------------------------------------------------------- LaTeX → SymPy 문자열


def _read_group(s: str, i: int) -> tuple[str, int]:
    """s[i]부터 {...} 하나 또는 글자 하나를 읽는다."""
    while i < len(s) and s[i] == " ":
        i += 1
    if i >= len(s):
        raise ValueError("incomplete")
    if s[i] != "{":
        if s[i] == "\\":
            m = re.match(r"\\[a-zA-Z]+", s[i:])
            if m:
                return s[i : i + m.end()], i + m.end()
        return s[i], i + 1
    depth = 0
    for j in range(i, len(s)):
        if s[j] == "{":
            depth += 1
        elif s[j] == "}":
            depth -= 1
            if depth == 0:
                return s[i + 1 : j], j + 1
    raise ValueError("unbalanced braces")


def _expand_frac(s: str) -> str:
    out = []
    i = 0
    while i < len(s):
        m = re.match(r"\\(?:d|t)?frac", s[i:])
        if m:
            num, i = _read_group(s, i + m.end())
            den, i = _read_group(s, i)
            out.append(f"(({_expand_frac(num)})/({_expand_frac(den)}))")
        else:
            out.append(s[i])
            i += 1
    return "".join(out)


def _expand_sum(s: str) -> str:
    """\\sum_{r=1}^{n} term → Sum((term),(r,(1),(n)))"""
    out = []
    i = 0
    while i < len(s):
        m = re.match(r"\\sum\s*_\s*\{\s*([a-zA-Z])\s*=\s*([^{}]*)\}\s*\^\s*(\{[^{}]*\}|[0-9a-zA-Z])", s[i:])
        if not m:
            out.append(s[i])
            i += 1
            continue
        var, lo, hi = m.group(1), m.group(2), m.group(3).strip("{}")
        j = i + m.end()
        while j < len(s) and s[j] == " ":
            j += 1
        # 더해지는 항: {…} / (…) / \frac{}{} / 숫자·문자와 거듭제곱 하나
        if j < len(s) and s[j] in "{(":
            close = "}" if s[j] == "{" else ")"
            depth = 0
            k = j
            for k in range(j, len(s)):
                if s[k] == s[j]:
                    depth += 1
                elif s[k] == close:
                    depth -= 1
                    if depth == 0:
                        break
            term, j = s[j + 1 : k], k + 1
        elif s.startswith("\\frac", j) or s.startswith("\\dfrac", j):
            start = j
            j = s.index("frac", j) + 4
            _, j = _read_group(s, j)
            _, j = _read_group(s, j)
            term = s[start:j]
        else:
            mm = re.match(r"[0-9a-zA-Z.]+(\^\s*(\{[^{}]*\}|[0-9a-zA-Z]))?", s[j:])
            if not mm:
                raise ValueError("bad sum")
            term, j = s[j : j + mm.end()], j + mm.end()
        out.append(f"Sum(({_expand_sum(term)}),({var},({lo}),({hi})))")
        i = j
    return "".join(out)


def latex_to_sympy_str(src: str) -> str:
    s = src.strip()
    s = re.sub(r"^\\\(|\\\)$|^\\\[|\\\]$|^\$+|\$+$", "", s).strip()
    s = s.replace("−", "-").replace("×", "*").replace("÷", "/").replace("·", "*")
    s = re.sub(r"\\(left|right|big|Big|bigg|Bigg)\b", "", s)
    s = re.sub(r"\\[,;:! ]|\\quad|\\qquad|~", " ", s)
    s = re.sub(r"\\text\{[^}]*\}", " ", s)
    s = re.sub(r"\\[dt]?binom\s*\{([^{}]*)\}\s*\{([^{}]*)\}", r"binomial((\1),(\2))", s)
    s = re.sub(r"\\left\s*|\\right\s*", "", s)
    s = _expand_sum(s)
    s = _expand_frac(s)
    # T_{r+1}, a_n 같은 아래첨자 이름은 기호 하나로
    s = re.sub(r"([a-zA-Z])_\{([^{}]*)\}", lambda m: m.group(1) + "_" + re.sub(r"[^0-9a-zA-Z]", "", m.group(2)), s)
    s = re.sub(r"([a-zA-Z])_([0-9a-zA-Z])", r"\1_\2", s)
    s = re.sub(r"\\(cdot|times|ast)", "*", s)
    s = s.replace(r"\div", "/")
    s = s.replace(r"\{", "(").replace(r"\}", ")").replace("{", "(").replace("}", ")")
    s = s.replace("[", "(").replace("]", ")")
    s = re.sub(r"(\d),(\d{3})", r"\1\2", s)  # 1,000 → 1000
    if "\\" in s:
        raise ValueError(f"unsupported command in {src!r}")
    return s


def parse_side(text: str):
    return parse_expr(latex_to_sympy_str(text), transformations=TRANSFORMS, evaluate=True)


def parse_equation(text: str):
    """'a = b' 를 (lhs, rhs) 로. '=' 이 없거나 2개 이상이면 ValueError."""
    t = text.replace(r"\Leftrightarrow", "=").replace(r"\iff", "=")
    t = re.sub(r"^\s*(\\therefore|∴|\\Rightarrow|⇒|→)\s*", "", t)
    parts = t.split("=")
    if len(parts) != 2:
        raise ValueError("needs exactly one '='")
    if not parts[0].strip() or not parts[1].strip():
        raise ValueError("empty side")
    return parse_side(parts[0]), parse_side(parts[1])


# ---------------------------------------------------------------- 판정


def solution_set(lhs, rhs, var: Symbol):
    return solveset(simplify(lhs - rhs), var, domain=S.Reals)


def main_symbol(lhs, rhs) -> Optional[Symbol]:
    syms = sorted((lhs - rhs).free_symbols, key=lambda s: s.name)
    if not syms:
        return None
    for s in syms:
        if s.name == "x":
            return s
    return syms[0]


Status = Literal["ok", "wrong", "unparsed"]


class LineIn(BaseModel):
    line: int
    latex: str


class VerifyIn(BaseModel):
    problem: str
    lines: list[LineIn]


class LineOut(BaseModel):
    line: int
    status: Status
    final: bool = False  # 'x = 값' 꼴의 최종 답인지


class VerifyOut(BaseModel):
    ok: bool
    results: list[LineOut]
    first_wrong: Optional[int] = None
    solved: bool = False
    error: Optional[str] = None


def _is_final(lhs, rhs, var: Symbol) -> bool:
    return (lhs == var and var not in rhs.free_symbols) or (rhs == var and var not in lhs.free_symbols)


def verify(problem: str, lines: list[LineIn]) -> VerifyOut:
    try:
        pl, pr = parse_equation(problem)
    except Exception as e:  # noqa: BLE001
        return VerifyOut(ok=False, results=[], error=f"문제를 해석하지 못했어요: {e}")
    var = main_symbol(pl, pr) or Symbol("x")
    target = solution_set(pl, pr, var)

    results: list[LineOut] = []
    first_wrong = None
    solved = False
    for ln in sorted(lines, key=lambda l: l.line):
        if not ln.latex.strip():
            continue
        try:
            l, r = parse_equation(ln.latex)
            # 학생이 다른 문자를 썼다면 (예: 인식 오류) 해석 불가로 처리
            extra = (l - r).free_symbols - {var}
            if extra:
                raise ValueError("unknown symbols")
            got = solution_set(l, r, var)
            same = got == target
            status: Status = "ok" if same else "wrong"
            final = same and _is_final(l, r, var)
        except Exception:  # noqa: BLE001
            results.append(LineOut(line=ln.line, status="unparsed"))
            continue
        if status == "wrong" and first_wrong is None:
            first_wrong = ln.line
        results.append(LineOut(line=ln.line, status=status, final=final))

    # 틀린 줄이 없고 마지막으로 해석된 줄이 'x = 값' 이면 풀이 완료
    parsed = [r for r in results if r.status != "unparsed"]
    if parsed and first_wrong is None and parsed[-1].final:
        solved = True
    return VerifyOut(ok=True, results=results, first_wrong=first_wrong, solved=solved)


# ---------------------------------------------------------------- 새 문제 확인


class CheckIn(BaseModel):
    latex: str


class CheckOut(BaseModel):
    ok: bool
    reason: Optional[Literal["parse", "not_linear", "no_unique", "not_equation"]] = None
    solution: Optional[str] = None


def check_problem(latex: str) -> CheckOut:
    """학생이 추가한 문제가 해가 하나인 일차방정식인지 확인"""
    from sympy import Poly, FiniteSet

    # 부등식·증명 문제 등 '=' 하나짜리 방정식이 아닌 것
    if re.search(r"[<>≤≥≠]|\\(geq?|leq?|neq?|ge|le|gt|lt|forall|text)\b", latex) or latex.count("=") != 1:
        return CheckOut(ok=False, reason="not_equation")
    try:
        l, r = parse_equation(latex)
    except Exception:  # noqa: BLE001
        return CheckOut(ok=False, reason="parse")
    expr = simplify(l - r)
    syms = expr.free_symbols
    if len(syms) != 1:
        return CheckOut(ok=False, reason="not_linear" if len(syms) > 1 else "no_unique")
    var = next(iter(syms))
    try:
        if Poly(expr, var).degree() != 1:
            return CheckOut(ok=False, reason="not_linear")
    except Exception:  # noqa: BLE001  (분모에 x가 있는 식 등)
        return CheckOut(ok=False, reason="not_linear")
    sol = solveset(expr, var, domain=S.Reals)
    if not isinstance(sol, FiniteSet) or len(sol) != 1:
        return CheckOut(ok=False, reason="no_unique")
    return CheckOut(ok=True, solution=f"{var} = {next(iter(sol))}")


# ---------------------------------------------------------------- FastAPI

app = FastAPI(docs_url="/api/py/docs", openapi_url="/api/py/openapi.json")


@app.get("/api/py/health")
def health():
    return {"ok": True}


@app.post("/api/py/verify", response_model=VerifyOut)
def verify_endpoint(body: VerifyIn) -> VerifyOut:
    if len(body.lines) > 60 or len(body.problem) > 500 or any(len(l.latex) > 500 for l in body.lines):
        return VerifyOut(ok=False, results=[], error="too large")
    return verify(body.problem, body.lines)


class ClassifyOut(BaseModel):
    ok: bool
    kind: Optional[Literal["solve", "free"]] = None
    latex: Optional[str] = None
    reason: Optional[str] = None
    solution: Optional[str] = None


@app.post("/api/py/check", response_model=CheckOut)
def check_endpoint(body: CheckIn) -> CheckOut:
    if len(body.latex) > 300:
        return CheckOut(ok=False, reason="parse")
    return check_problem(body.latex)


@app.post("/api/py/classify", response_model=ClassifyOut)
def classify_endpoint(body: CheckIn) -> ClassifyOut:
    """새 문제 분류: 수식 하나뿐인 방정식(해 1개) → solve, 그 밖의 글/증명/이항정리 → free"""
    text = body.latex.strip()
    if not text or len(text) > 1500:
        return ClassifyOut(ok=False, reason="parse")
    only_math = re.fullmatch(r"\$+([^$]+)\$+", text)
    plain_math = "$" not in text and not re.search(r"[a-zA-Z]{4,}", re.sub(r"\\[a-zA-Z]+", "", text))
    if only_math or plain_math:
        eq = only_math.group(1) if only_math else text
        res = check_problem(eq)
        if res.ok:
            return ClassifyOut(ok=True, kind="solve", latex=eq, solution=res.solution)
        if res.reason == "parse" and plain_math:
            return ClassifyOut(ok=False, reason="parse")
    # 증명·이항정리·부등식·이차방정식 등: 줄마다 등식 검사 + Claude 확인
    return ClassifyOut(ok=True, kind="free")


# ================================================================ 증명·이항정리용 줄 검사
# 각 줄의 관계식(=, <, > …)이 참인지 본다. 판단이 확실할 때만 'wrong'을 주고, 애매하면 조용히 넘어간다.

import random

from sympy import Number, nsimplify as _nsimplify  # noqa: E402

REL_TOKENS = [r"\\leq", r"\\geq", r"\\neq", r"\\le", r"\\ge", r"\\ne", r"\\lt", r"\\gt", "<=", ">=", "≤", "≥", "≠", "=", "<", ">"]
REL_NORMAL = {r"\leq": "<=", r"\le": "<=", "≤": "<=", "<=": "<=", r"\geq": ">=", r"\ge": ">=", "≥": ">=", ">=": ">=",
              r"\neq": "!=", r"\ne": "!=", "≠": "!=", "=": "=", "<": "<", r"\lt": "<", ">": ">", r"\gt": ">"}
INT_NAMES = {"n", "k", "r", "m", "i", "j", "p", "q"}


def _split_top(s: str, seps: str) -> list[str]:
    parts, depth, cur = [], 0, ""
    for ch in s:
        if ch in "({[":
            depth += 1
        elif ch in ")}]":
            depth -= 1
        if depth == 0 and ch in seps:
            parts.append(cur)
            cur = ""
        else:
            cur += ch
    parts.append(cur)
    return parts


def _split_relations(seg: str) -> tuple[list[str], list[str]]:
    """'a = b < c' → (['a','b','c'], ['=','<']) (괄호 밖의 관계 기호만)"""
    exprs, rels, cur, depth, i = [], [], "", 0, 0
    while i < len(seg):
        ch = seg[i]
        if ch in "({[":
            depth += 1
        elif ch in ")}]":
            depth -= 1
        if depth == 0:
            tok = next((t for t in REL_TOKENS if seg.startswith(t, i) and not (t[0] == "\\" and seg[i + len(t): i + len(t) + 1].isalpha())), None)
            if tok:
                exprs.append(cur)
                rels.append(REL_NORMAL[tok])
                cur = ""
                i += len(tok)
                continue
        cur += ch
        i += 1
    exprs.append(cur)
    return exprs, rels


def _with_assumptions(e):
    reps = {}
    for sym in e.free_symbols:
        base = sym.name.split("_")[0]
        reps[sym] = Symbol(sym.name, integer=True, positive=True) if base in INT_NAMES else Symbol(sym.name, positive=True)
    return e.xreplace(reps)


def _parse_expr(text: str):
    t = text.strip()
    if not t:
        raise ValueError("empty")
    return _with_assumptions(parse_side(t))


def _numeric_diff(a, b) -> Optional[bool]:
    """여러 점에 넣어 a-b 가 0인지. True=항상 0, False=0 아님, None=판단 불가"""
    syms = sorted((a - b).free_symbols, key=lambda x: x.name)
    rnd = random.Random(7)
    ok_points = 0
    for _ in range(6):
        vals = {}
        for sy in syms:
            vals[sy] = rnd.randint(2, 9) if sy.is_integer else _nsimplify(rnd.randint(11, 39)) / 10
        try:
            d = complex((a - b).subs(vals).doit().evalf(30))
        except Exception:  # noqa: BLE001
            continue
        scale = 1.0
        try:
            scale = max(1.0, abs(complex(a.subs(vals).doit().evalf(30))))
        except Exception:  # noqa: BLE001
            pass
        if abs(d) > 1e-9 * scale:
            return False
        ok_points += 1
    return True if ok_points >= 3 else None


def _relation_status(a, b, rel: str) -> str:
    """'ok' | 'wrong' | 'neutral' | ('eq' = 풀어야 하는 방정식)"""
    sa, sb = a.free_symbols, b.free_symbols
    if not sa and not sb:
        try:
            va, vb = complex(a.doit().evalf(30)), complex(b.doit().evalf(30))
        except Exception:  # noqa: BLE001
            return "neutral"
        if abs(va.imag) > 1e-12 or abs(vb.imag) > 1e-12:
            return "neutral" if rel != "=" else ("ok" if abs(va - vb) < 1e-9 else "wrong")
        x, y, tol = va.real, vb.real, 1e-9 * max(1, abs(va.real), abs(vb.real))
        res = {"=": abs(x - y) <= tol, "!=": abs(x - y) > tol, "<": x < y - tol, ">": x > y + tol, "<=": x <= y + tol, ">=": x >= y - tol}[rel]
        return "ok" if res else "wrong"
    if rel != "=":
        return "neutral"
    # 한쪽이 숫자이거나 기호가 하나뿐이면 '풀어야 하는 방정식' (예: 8 - 2r = 0, r = 4)
    if (not sa or not sb) and len(sa | sb) == 1:
        return "eq"
    if sa != sb:
        return "neutral"  # 새 문자를 도입하는 치환 (예: 5^k - 1 = 4m)
    try:
        if simplify((a - b).doit()) == 0:
            return "ok"
    except Exception:  # noqa: BLE001
        pass
    r = _numeric_diff(a, b)
    return "ok" if r is True else "wrong" if r is False else "neutral"


def _clean_line(text: str) -> str:
    t = text.replace("−", "-").replace("×", r"\times ").replace("÷", r"\div ")
    t = re.sub(r"\\text\{[^{}]*\}|\\mathrm\{[^{}]*\}", " , ", t)
    t = re.sub(r"\\(therefore|because|Rightarrow|implies|Longrightarrow|iff|Leftrightarrow|quad|qquad)\b|∴|⇒|→", " , ", t)
    t = re.sub(r"\\[,;:! ]", " ", t)
    t = re.sub(r"\\(cdots|ldots|dots)", "", t)
    return t


class FreeLineOut(BaseModel):
    line: int
    status: Status


class FreeIn(BaseModel):
    lines: list[LineIn]
    answer_type: Optional[Literal["number", "expand", "proof", "other"]] = None
    answer: Optional[str] = None


class FreeOut(BaseModel):
    ok: bool
    results: list[FreeLineOut]
    first_wrong: Optional[int] = None
    solved: bool = False


def check_free(lines: list[LineIn], answer_type: Optional[str] = None, answer: Optional[str] = None) -> FreeOut:
    results: list[FreeLineOut] = []
    first_wrong = None
    prev_last = None  # 앞 줄의 마지막 식 (줄이 '= …'로 시작하면 이어서 비교)
    prev_eq = None  # 앞 줄의 '풀어야 하는 방정식' (해가 같은지 비교)
    finals = []  # 줄마다 마지막 식 (정답 판정용)
    ans_expr = None
    if answer:
        try:
            ans_expr = _parse_expr(answer)
        except Exception:  # noqa: BLE001
            ans_expr = None

    for ln in sorted(lines, key=lambda l: l.line):
        text = _clean_line(ln.latex)
        statuses: list[str] = []
        last = None
        for si, seg in enumerate(_split_top(text, ",;:")):
            if not seg.strip():
                continue
            exprs, rels = _split_relations(seg)
            # 줄 맨 앞이 관계 기호면 앞 줄의 마지막 식에서 이어짐
            if exprs and not exprs[0].strip():
                if si == 0 and statuses == [] and prev_last is not None and rels:
                    parsed = [prev_last]
                    exprs = exprs[1:]
                else:
                    # 'RHS = …' 처럼 앞말이 지워진 조각: 남은 관계식만 검사
                    parsed = []
                    exprs, rels = exprs[1:], rels[1:]
            else:
                parsed = []
            try:
                parsed += [_parse_expr(e) for e in exprs]
            except Exception:  # noqa: BLE001
                continue
            if len(parsed) == 1:
                last = parsed[0]
                continue
            for a, b, rel in zip(parsed, parsed[1:], rels):
                st = _relation_status(a, b, rel)
                if st == "eq":
                    eq = (a - b)
                    sym = next(iter(eq.free_symbols))
                    if prev_eq is not None and prev_eq[0] == sym.name:
                        try:
                            same = solveset(eq, sym, S.Reals) == prev_eq[1]
                            st = "ok" if same else "wrong"
                        except Exception:  # noqa: BLE001
                            st = "neutral"
                    else:
                        st = "neutral"
                    try:
                        prev_eq = (sym.name, solveset(eq, sym, S.Reals))
                    except Exception:  # noqa: BLE001
                        prev_eq = None
                statuses.append(st)
            last = parsed[-1]
        if "wrong" in statuses:
            status: Status = "wrong"
            if first_wrong is None:
                first_wrong = ln.line
        elif "ok" in statuses:
            status = "ok"
        else:
            status = "unparsed"
        if last is not None:
            prev_last = last
            finals.append((status, last))
        results.append(FreeLineOut(line=ln.line, status=status))

    solved = False
    if first_wrong is None and ans_expr is not None:
        for st, e in finals:
            if st == "wrong":
                continue
            try:
                if answer_type == "number" and not e.free_symbols and abs(complex(e.doit().evalf()) - complex(ans_expr.evalf())) < 1e-9:
                    solved = True
                elif answer_type == "expand" and e.free_symbols and expand(e) == e and simplify(e - ans_expr) == 0:
                    solved = True
            except Exception:  # noqa: BLE001
                pass
    return FreeOut(ok=True, results=results, first_wrong=first_wrong, solved=solved)


from sympy import expand  # noqa: E402


@app.post("/api/py/check-lines", response_model=FreeOut)
def check_lines_endpoint(body: FreeIn) -> FreeOut:
    if len(body.lines) > 60 or any(len(l.latex) > 500 for l in body.lines):
        return FreeOut(ok=False, results=[])
    return check_free(body.lines, body.answer_type, body.answer)
