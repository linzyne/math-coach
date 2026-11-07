import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))

from index import LineIn, check_free  # noqa: E402


def run(*lines, answer_type=None, answer=None):
    out = check_free([LineIn(line=i, latex=t) for i, t in enumerate(lines)], answer_type, answer)
    return [r.status for r in out.results], out


def test_induction_sum_correct():
    st, _ = run(
        r"\text{When } n=1: \text{LHS} = 1, \text{RHS} = \frac{1(1+1)}{2} = 1",
        r"\text{Assume true for } n=k: \sum_{r=1}^{k} r = \frac{k(k+1)}{2}",
        r"\sum_{r=1}^{k+1} r = \frac{k(k+1)}{2} + (k+1)",
        r"= \frac{k(k+1) + 2(k+1)}{2}",
        r"= \frac{(k+1)(k+2)}{2}",
        r"\text{So true for } n = k+1, \text{ hence true for all } n \in \mathbb{Z}^+",
    )
    assert "wrong" not in st, st
    assert st[0] == "ok" and st[3] == "ok" and st[4] == "ok"


def test_induction_algebra_mistake():
    st, out = run(
        r"\sum_{r=1}^{k+1} r = \frac{k(k+1)}{2} + (k+1)",
        r"= \frac{(k+1)(k+3)}{2}",
    )
    assert st[1] == "wrong" and out.first_wrong == 1


def test_sum_identity_direct():
    st, _ = run(r"\sum_{r=1}^{k+1} r^2 = \sum_{r=1}^{k} r^2 + (k+1)^2")
    assert st == ["ok"]
    st, _ = run(r"\frac{k(k+1)(2k+1)}{6} + (k+1)^2 = \frac{(k+1)(k+2)(2k+3)}{6}")
    assert st == ["ok"]
    st, _ = run(r"\frac{k(k+1)(2k+1)}{6} + (k+1)^2 = \frac{(k+1)(k+2)(2k+1)}{6}")
    assert st == ["wrong"]


def test_divisibility_substitution_is_quiet():
    st, _ = run(
        r"\text{Assume } 5^k - 1 = 4m",
        r"5^{k+1} - 1 = 5 \cdot 5^k - 1",
        r"= 5(5^k - 1) + 4",
        r"= 5(4m) + 4",
        r"= 4(5m + 1)",
    )
    assert st == ["unparsed", "ok", "ok", "unparsed", "ok"], st


def test_numeric_base_case_and_inequality():
    st, _ = run(r"3^2 = 9 > 2^2 + 2 = 6")
    assert st == ["ok"]
    st, _ = run(r"3^2 = 9 < 2^2 + 2 = 6")
    assert st == ["wrong"]
    st, _ = run(r"3^{k+1} = 3 \cdot 3^k > 3(2^k + k)")
    assert st == ["ok"]


def test_binomial_coefficient_problem():
    st, out = run(
        r"T_{r+1} = \binom{8}{r} (2x)^{8-r} \left(-\frac{1}{x}\right)^r",
        r"8 - 2r = 0",
        r"r = 4",
        r"T_5 = \binom{8}{4} \cdot 2^4 = 70 \cdot 16 = 1120",
        answer_type="number", answer="1120",
    )
    assert "wrong" not in st and out.solved, st
    st, out = run(r"8 - 2r = 0", r"r = 3", answer_type="number", answer="1120")
    assert st == ["unparsed", "wrong"] and not out.solved


def test_wrong_binomial_number():
    st, _ = run(r"\binom{5}{3} \cdot 3^2 \cdot 2^3 = 10 \cdot 9 \cdot 8 = 620")
    assert st == ["wrong"]


def test_expand():
    st, out = run(r"(2x-1)^4 = 16x^4 - 32x^3 + 24x^2 - 8x + 1", answer_type="expand", answer="(2x-1)^4")
    assert st == ["ok"] and out.solved
    st, out = run(r"(2x-1)^4 = 16x^4 - 32x^3 + 24x^2 + 8x + 1", answer_type="expand", answer="(2x-1)^4")
    assert st == ["wrong"] and not out.solved
    st, out = run(r"(2x-1)^4", answer_type="expand", answer="(2x-1)^4")
    assert not out.solved


def test_telescoping_sum():
    st, _ = run(r"\sum_{r=1}^{k+1} \frac{1}{r(r+1)} = \frac{k}{k+1} + \frac{1}{(k+1)(k+2)} = \frac{k+1}{k+2}")
    assert st == ["ok"], st


def test_plain_text_is_quiet():
    st, _ = run("Assume true for n=k", "hello world")
    assert st == ["unparsed", "unparsed"]
