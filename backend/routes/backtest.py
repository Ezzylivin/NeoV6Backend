# routers/backtest.py
from fastapi import APIRouter, Depends
from services.backtest_service import run_backtest
from core.deps import get_current_user
import pandas as pd

router = APIRouter()

@router.post("/backtest/run")
def run_backtest_endpoint(user=Depends(get_current_user)):
    # Example: load the user’s features+predictions from CSV
    df = pd.read_csv(f"user_data/{user.id}/features_with_predictions.csv", index_col=0, parse_dates=True)

    results = run_backtest(df)
    return results
