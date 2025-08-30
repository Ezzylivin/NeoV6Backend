// File: backend/models/Backtest.js
import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const tradeResultSchema = new Schema({
  entryTime: Date,
  exitTime: Date,
  entryPrice: Number,
  exitPrice: Number,
  position: { type: String, enum:['long','short'] },
  profit: Number,
  duration: Number,
  result: { type:String, enum:['win','loss','breakeven'] },
}, {_id:false});

const strategyConfigSchema = new Schema({
  name: { type:String, required:true, default:'crossoverStrategy' },
  parameters: { type:Schema.Types.Mixed },
}, {_id:false});

const backtestSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref:'user', required:true, index:true },
  timeframe: { type:String, required:true, trim:true, uppercase:true },
  initialBalance: { type:Number, required:true, min:[0,'Initial balance must be positive'] },
  finalBalance: { type:Number, min:[0,'Final balance must be positive'] },
  profit: Number,
  totalTrades: { type:Number, min:[0,'Total trades cannot be negative'] },
  candlesTested: { type:Number, required:true, min:[1,'At least one candle must be tested'] },
  strategy: strategyConfigSchema,
  tradeBreakdown: [tradeResultSchema],
}, {timestamps:true});

backtestSchema.pre('save', function(next){
  if(Array.isArray(this.tradeBreakdown)){
    const totalProfit = this.tradeBreakdown.reduce((sum,trade)=> sum+(trade.profit||0),0);
    this.totalTrades = this.tradeBreakdown.length;
    this.profit = totalProfit;
    this.finalBalance = this.initialBalance + totalProfit;
  }
  next();
});

export default model('backtest', backtestSchema);
