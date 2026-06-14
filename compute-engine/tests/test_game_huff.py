"""博弈选址 + Huff拟合 集成测试"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import numpy as np
from app.services.huff import HuffMLE
from app.services.game_theory import StackelbergSolver, StoreInfo, DemandInfo


def test_huff_mle():
    """Huff MLE with distance-choice tradeoffs per demand point"""
    store_attrs = {
        "s1": {"area": 150, "brand": 0.9},
        "s2": {"area": 80, "brand": 0.5},
    }
    # Each demand point sees BOTH stores; nearer one gets higher weight
    observations = []
    for i in range(20):
        d = f"d{i}"
        # s1 is closer -> higher weight
        observations.append({"demand_id": d, "store_id": "s1", "weight": 8, "distance_m": 100})
        # s2 is farther -> lower weight
        observations.append({"demand_id": d, "store_id": "s2", "weight": 2, "distance_m": 500})

    mle = HuffMLE(
        demand_ids=[f"d{i}" for i in range(20)],
        store_attrs=store_attrs,
        observations=observations,
    )
    result = mle.fit(initial=np.array([-0.5, 0.5, 0.3, -3.0]))

    print(f"\n=== Huff MLE Test ===")
    print(f"Params: {result.fitted_params}")
    print(f"R^2: {result.r_squared:.4f}  Conv: {result.convergence}")
    print("Huff MLE test done -- OK")


def test_game_solver():
    """Stackelberg博弈选址求解"""
    np.random.seed(42)
    leader = [
        StoreInfo(id="L1", lng=108.94, lat=34.26, area=100, brand=0.8),
        StoreInfo(id="L2", lng=108.95, lat=34.27, area=80, brand=0.6),
        StoreInfo(id="L3", lng=108.93, lat=34.25, area=120, brand=0.9),
        StoreInfo(id="L4", lng=108.96, lat=34.28, area=90, brand=0.5),
        StoreInfo(id="L5", lng=108.92, lat=34.24, area=70, brand=0.4),
    ]
    follower = [
        StoreInfo(id="F1", lng=108.941, lat=34.261, area=100, brand=0.7),
        StoreInfo(id="F2", lng=108.951, lat=34.271, area=85, brand=0.5),
        StoreInfo(id="F3", lng=108.931, lat=34.251, area=110, brand=0.8),
        StoreInfo(id="F4", lng=108.945, lat=34.265, area=75, brand=0.6),
    ]
    demand = [
        DemandInfo(h3=f"d{i}", lng=108.94+np.random.randn()*0.02, lat=34.26+np.random.randn()*0.02,
                   population=np.random.randint(500,2000), consumption=35)
        for i in range(20)
    ]
    solver = StackelbergSolver(leader, follower, demand, {"lambda": 2.0, "alpha_area": 1.0, "alpha_brand": 0.8})
    solution = solver.solve(leader_p=2, follower_q=2, iterations=100)

    print(f"\n=== Game Solver ===")
    print(f"Leader: {solution.leader_sites} rev={solution.leader_revenue}")
    print(f"Follower: {solution.follower_sites} rev={solution.follower_revenue}")
    print(f"Cann: {solution.cannibalization_pct}%  Time: {solution.solution_time_ms}ms")
    assert len(solution.leader_sites) == 2 and solution.leader_revenue > 0
    print("Game solver done -- OK")


def test_game_scenarios():
    """多情景模拟"""
    np.random.seed(42)
    leader = [StoreInfo(id=f"L{i}", lng=108.94+i*0.01, lat=34.26+i*0.01, area=100, brand=0.7) for i in range(1,4)]
    follower = [StoreInfo(id=f"F{i}", lng=108.94+i*0.005, lat=34.26-i*0.005, area=90, brand=0.6) for i in range(1,4)]
    demand = [DemandInfo(h3=f"d{i}", lng=108.94+np.random.randn()*0.02, lat=34.26+np.random.randn()*0.02,
                         population=np.random.randint(500,2000), consumption=35) for i in range(10)]
    solver = StackelbergSolver(leader, follower, demand, {"lambda": 2.0, "alpha_area": 1.0, "alpha_brand": 0.8})

    result = solver.run_scenarios(2, 2, [
        {"label": "Aggressive(q=3)", "type": "counter_attack", "follower_q_override": 3},
        {"label": "Conservative(q=1)", "type": "counter_attack", "follower_q_override": 1},
    ], 50)

    print(f"\n=== Scenarios ===")
    for sc in result["scenarios"]:
        print(f"  {sc['label']}: L={sc['leader_revenue']} F={sc['follower_revenue']} cann={sc['cannibalization_pct']}%")
    print(f"Robust: {result['robust_solution']}")
    print("Scenarios done -- OK")


if __name__ == "__main__":
    test_huff_mle()
    test_game_solver()
    test_game_scenarios()
    print("\n=== ALL TESTS PASSED ===")
