import api, { setAuthToken } from "./apiClient.js";

const normalizeOptions = (raw) => ({
  strategies: raw?.strategies || [],
  symbols: raw?.symbols || [],
  timeframes: raw?.timeframes || [],
  takeProfits: raw?.takeProfits || [],
  stopLosses: raw?.stopLosses || [],
});

const normalizePastBacktests = (raw) => ({
  backtests: raw?.backtests || [],
  total: raw?.total || 0,
});

export async function fetchOptions() {
  setAuthToken(localStorage.getItem('userToken'));
  try {
    const response = await api.get("/backtest/options");
    return normalizeOptions(response.data);
  } catch (error) {
    console.error("fetchOptions(): failed to fetch options.", error);
    return normalizeOptions({});
  }
}

export async function fetchAll(page = 1) {
  setAuthToken(localStorage.getItem('userToken'));
  try {
    const response = await api.get(`/backtest?page=${page}`);
    return normalizePastBacktests(response.data);
  } catch (error) {
    console.error("fetchAll(): failed to fetch past backtests.", error);
    return normalizePastBacktests({});
  }
}

export async function fetchById(id) {
  setAuthToken(localStorage.getItem('userToken'));
  try {
    const { data } = await api.get(`/backtest/${id}`);
    return data;
  } catch (error) {
    console.error(`fetchById(${id}): failed to fetch backtest.`, error);
    throw error;
  }
}

export async function deleteById(id) {
  setAuthToken(localStorage.getItem('userToken'));
  try {
    const { data } = await api.delete(`/backtest/${id}`);
    return data;
  } catch (error) {
    console.error(`deleteById(${id}): failed to delete backtest.`, error);
    throw error;
  }
}

export async function runBacktest(payload) {
  setAuthToken(localStorage.getItem('userToken'));
  if (!payload.code) throw new Error("strategy 'code' is required for backtest");
  const fullPayload = { ...payload };
  try {
    const { data } = await api.post("/backtest/run", fullPayload);
    return data;
  } catch (error) {
    console.error("runBacktest(): failed", error);
    throw error;
  }
}

export async function previewStrategy(payload) {
  setAuthToken(localStorage.getItem('userToken'));
  if (!payload.code) throw new Error("strategy 'code' is required for preview");
  const previewPayload = { ...payload };
  try {
    const { data } = await api.post("/backtest/preview", previewPayload);
    return data;
  } catch (error) {
    console.error("previewStrategy(): failed", error);
    throw error;
  }
}
