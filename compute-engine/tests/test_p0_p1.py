"""P0 + P1 Feature Test -- Hard constraint filtering and robust solve"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import numpy as np
from app.services.game_theory import StackelbergSolver, StoreInfo, DemandInfo


def test_p0_filter_pharmacy_elimination():
    """P0: pharmacy candidates within 350m of competitors get eliminated."""
    np.random.seed(99)
    # L1 very close to F1 (<350m), both get eliminated
    # L2 far from everyone (500m), F2 also far
    leader = [
        StoreInfo(id="L1", lng=108.94, lat=34.26, area=100, brand=0.8,
                  extras={"competitor_distance": 200}),
        StoreInfo(id="L2", lng=108.96, lat=34.30, area=80, brand=0.6,
                  extras={"competitor_distance": 500}),
    ]
    follower = [
        StoreInfo(id="F1", lng=108.941, lat=34.261, area=100, brand=0.7),
        StoreInfo(id="F2", lng=108.97, lat=34.35, area=90, brand=0.6),
    ]
    demand = [
        DemandInfo(h3=f"d{i}", lng=108.94+np.random.randn()*0.02, lat=34.26+np.random.randn()*0.02,
                   population=1000, consumption=35) for i in range(10)
    ]
    solver = StackelbergSolver(leader, follower, demand, {"lambda": 2.0})
    fl, ff, report = solver.filter_candidates("pharmacy")

    print(f"Filter report: eliminated_L={report['eliminated_L']} eliminated_F={report['eliminated_F']}")
    print(f"Before: L={report['before_L']} F={report['before_F']} After: L={report['after_L']} F={report['after_F']}")
    # L1 eliminated (200<350), L2 passes. F1 eliminated (close to L1 <350m), F2 passes.
    assert len(report["eliminated_L"]) >= 1
    assert any(e["id"] == "L1" for e in report["eliminated_L"])
    assert len(fl) == 1
    assert fl[0].id == "L2"
    print("P0 pharmacy filter: OK")


def test_p0_filter_auto4s_land_cap():
    """P0: auto4s candidates with non-commercial/industrial land get capped."""
    leader = [
        StoreInfo(id="L1", lng=108.94, lat=34.26, area=100, brand=0.8,
                  extras={"land_type": "residential"}),
        StoreInfo(id="L2", lng=108.96, lat=34.29, area=80, brand=0.6,
                  extras={"land_type": "commercial"}),
    ]
    follower = []
    demand = [DemandInfo(h3="d0", lng=108.94, lat=34.26, population=1000)]
    solver = StackelbergSolver(leader, follower, demand, {"lambda": 2.0})
    fl, ff, report = solver.filter_candidates("auto4s")

    print(f"Filter report: capped={report['capped']}")
    assert len(report["capped"]) == 1
    assert report["capped"][0]["id"] == "L1"
    assert report["capped"][0]["cap"] == 0.3
    assert len(fl) == 2  # no elimination, only cap
    print("P0 auto4s land cap: OK")


def test_p0_filter_no_constraints():
    """P0: industry with no hard constraints passes all candidates."""
    leader = [StoreInfo(id="L1", lng=108.94, lat=34.26, area=100, brand=0.8)]
    follower = []
    demand = [DemandInfo(h3="d0", lng=108.94, lat=34.26, population=1000)]
    solver = StackelbergSolver(leader, follower, demand, {"lambda": 2.0})
    fl, ff, report = solver.filter_candidates("convenience")

    assert report["action"] == "no_constraints"
    assert report["before_L"] == 1
    print("P0 no constraints: OK")


def test_p1_robust_solve():
    """P1: robust solve with parameter perturbations."""
    np.random.seed(42)
    leader = [StoreInfo(id=f"L{i}", lng=108.94+i*0.01, lat=34.26+i*0.01, area=100, brand=0.7) for i in range(1,4)]
    follower = [StoreInfo(id=f"F{i}", lng=108.94+i*0.005, lat=34.26-i*0.005, area=90, brand=0.6) for i in range(1,4)]
    demand = [DemandInfo(h3=f"d{i}", lng=108.94+np.random.randn()*0.02, lat=34.26+np.random.randn()*0.02,
                         population=np.random.randint(500,2000), consumption=35) for i in range(10)]
    solver = StackelbergSolver(leader, follower, demand, {"lambda": 2.0, "alpha_area": 1.0, "alpha_brand": 0.8})

    result = solver.solve_robust(leader_p=2, follower_q=2, iterations=50, n_perturbations=5)

    print(f"Stability: {result.stability_score}")
    print(f"Selection freqs: {result.selection_frequencies}")
    print(f"Perturbation runs: {result.perturbation_runs}")
    print(f"Sensitivity warning: {result.sensitivity_warning}")

    assert result.stability_score >= 0.0 and result.stability_score <= 1.0
    assert result.perturbation_runs > 0
    assert isinstance(result.selection_frequencies, dict)
    assert result.base_solution.leader_revenue > 0
    print("P1 robust solve: OK")


def test_p1_robust_with_se():
    """P1: robust solve with standard_errors from Huff fit."""
    np.random.seed(42)
    leader = [StoreInfo(id=f"L{i}", lng=108.94+i*0.01, lat=34.26+i*0.01, area=100, brand=0.7) for i in range(1,4)]
    follower = [StoreInfo(id=f"F{i}", lng=108.94+i*0.005, lat=34.26-i*0.005, area=90, brand=0.6) for i in range(1,4)]
    demand = [DemandInfo(h3=f"d{i}", lng=108.94+np.random.randn()*0.02, lat=34.26+np.random.randn()*0.02,
                         population=np.random.randint(500,2000), consumption=35) for i in range(10)]
    solver = StackelbergSolver(leader, follower, demand, {"lambda": 2.0, "alpha_area": 1.0, "alpha_brand": 0.8})

    # Simulate Huff standard errors
    standard_errors = {"const": 0.1, "area": 0.15, "brand": 0.12, "dist": 0.2}
    result = solver.solve_robust(leader_p=2, follower_q=2, iterations=50, n_perturbations=3,
                                 standard_errors=standard_errors)

    print(f"With SE: stability={result.stability_score}, runs={result.perturbation_runs}")
    assert result.stability_score >= 0.0 and result.stability_score <= 1.0
    print("P1 robust with SE: OK")


if __name__ == "__main__":
    test_p0_filter_pharmacy_elimination()
    test_p0_filter_auto4s_land_cap()
    test_p0_filter_no_constraints()
    test_p1_robust_solve()
    test_p1_robust_with_se()
    print("\n=== ALL P0+P1 TESTS PASSED ===")
