import {MANUAL_KEY as key,newWallet as walletFactory,previewOrder as previewBase,commitOrder as commitBase,quoteBlockReason as quoteReason} from './manual-paper-core.mjs?v=3';
import {capturePaperDecision} from './paper-decision-snapshot-v1.mjs';
// One engine and one ledger: add the snapshot to the engine's validated clone.
export const MANUAL_KEY=key,newWallet=walletFactory,previewOrder=previewBase,quoteBlockReason=quoteReason;
export function commitOrder(wallet,preview,quote,now=Date.now(),chartContext=null){
 const next=commitBase(wallet,preview,quote,now);
 if(next===wallet)return next;
 const trade=next.trades.at(-1);
 trade.decisionSnapshot=capturePaperDecision(wallet,trade,quote,chartContext,now);
 return next;
}
