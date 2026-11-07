import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))

from index import LineIn, verify, latex_to_sympy_str  # noqa: E402


def run(problem, *lines):
    return verify(problem, [LineIn(line=i, latex=t) for i, t in enumerate(lines)])


def statuses(out):
    return [r.status for r in out.results]


def test_correct_solution():
    out = run("4(x - 2) = 2x + 6", "4x - 8 = 2x + 6", "2x = 14", "x = 7")
    assert statuses(out) == ["ok", "ok", "ok"]
    assert out.solved and out.first_wrong is None


def test_first_wrong_line_and_carried_error():
    # 2번째 줄에서 부호 실수 → 3, 4번째 줄은 그걸 바르게 이어 써도 틀림
    out = run("4(x - 2) = 2x + 6", "4x - 2 = 2x + 6", "2x = 8", "x = 4")
    assert statuses(out) == ["wrong", "wrong", "wrong"]
    assert out.first_wrong == 0 and not out.solved


def test_fix_makes_ok():
    out = run("3x + 5 = 20", "3x = 25", "x = 5")
    assert statuses(out) == ["wrong", "ok"]
    out = run("3x + 5 = 20", "3x = 15", "x = 5")
    assert out.solved


def test_different_method_is_ok():
    # 분모를 먼저 없애든, 그대로 정리하든 맞음
    p = r"\frac{x + 1}{2} = \frac{x - 2}{3} + 2"
    assert run(p, "3(x+1) = 2(x-2) + 12", "3x + 3 = 2x + 8", "x = 5").solved
    assert run(p, r"\frac{x}{2} - \frac{x}{3} = -\frac{2}{3} + 2 - \frac{1}{2}", r"\frac{x}{6} = \frac{5}{6}", "x=5").solved
    assert run(p, "5 = x").solved


def test_decimals():
    out = run("0.3x - 1.2 = 0.1x + 0.4", "0.2x = 1.6", "x = 8")
    assert out.solved
    assert statuses(run("0.3x - 1.2 = 0.1x + 0.4", "3x - 12 = x + 4", "2x = 16", "x=8")) == ["ok", "ok", "ok"]
    assert statuses(run("0.3x - 1.2 = 0.1x + 0.4", "3x - 12 = x + 0.4")) == ["wrong"]


def test_mathpix_style_latex():
    assert latex_to_sympy_str(r"2 \left( 3 x - 1 \right) - (x + 4) = 9").replace(" ", "") == "2(3x-1)-(x+4)=9"
    out = run("2(3x - 1) - (x + 4) = 9", r"6 x-2-x-4=9", r"5 x=15", r"x=3")
    assert out.solved
    assert run("x/3 + 2 = 5", r"\frac{x}{3}=3", r"x=3 \times 3", "x=9").solved


def test_keyboard_style():
    assert run(r"\frac{x}{3} + 2 = 5", "x/3 = 3", "x = 9").solved
    assert run("5x = 3x + 12", "5x-3x=12", "2x=12", "x=6").solved


def test_unparsed_is_quiet():
    out = run("3x + 5 = 20", "3x+5", "3x = 15 = ", "x=5")
    assert statuses(out) == ["unparsed", "unparsed", "ok"]
    assert out.solved


def test_not_final_not_solved():
    out = run("3x + 5 = 20", "3x = 15")
    assert statuses(out) == ["ok"] and not out.solved


def test_all_sample_answers():
    samples = [
        ("3x + 5 = 20", "x = 5"), ("2x - 7 = 9", "x = 8"), ("5x = 3x + 12", "x = 6"),
        ("4(x - 2) = 2x + 6", "x = 7"), ("3(2x + 1) - 4 = 5x + 6", "x = 7"),
        (r"\frac{x}{3} + 2 = 5", "x = 9"), ("0.3x - 1.2 = 0.1x + 0.4", "x = 8"),
        ("2(3x - 1) - (x + 4) = 9", "x = 3"), (r"\frac{x + 1}{2} = \frac{x - 2}{3} + 2", "x = 5"),
        (r"\frac{x}{2} - \frac{x - 1}{3} = 1", "x = 4"),
    ]
    for p, a in samples:
        assert run(p, a).solved, p
