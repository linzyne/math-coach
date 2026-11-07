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


def latex_to_sympy_str(src: str) -> str:
    s = src.strip()
    s = re.sub(r"^\\\(|\\\)$|^\\\[|\\\]$|^\$+|\$+$", "", s).strip()
    s = s.replace("−", "-").replace("×", "*").replace("÷", "/").replace("·", "*")
    s = re.sub(r"\\(left|right|big|Big|bigg|Bigg)\b", "", s)
    s = re.sub(r"\\[,;:! ]|\\quad|\\qquad|~", " ", s)
    s = re.sub(r"\\text\{[^}]*\}", " ", s)
    s = _expand_frac(s)
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
