import type {Locale} from '@/lib/i18n';
const en={emptyOther:'No other markets match these filters.',instrument:'Market',reference:'Reference probability',points:'Points settlement',current:'Trade current round',history:'All rounds',quoteHelp:'How prices are shown',probability:'Yes probability',updated:'Updated',up:'Up',down:'Down'};
export const terminalCopy:Record<Locale,typeof en>={en,
 'zh-CN':{emptyOther:'暂无匹配的其他市场。',instrument:'市场',reference:'参考概率',points:'积分结算',current:'交易本轮',history:'全部轮次',quoteHelp:'价格说明',probability:'是的概率',updated:'更新于',up:'上涨',down:'下跌'},
 'zh-TW':{emptyOther:'目前沒有符合條件的其他市場。',instrument:'市場',reference:'參考機率',points:'積分結算',current:'交易本輪',history:'全部輪次',quoteHelp:'價格說明',probability:'是的機率',updated:'更新於',up:'上漲',down:'下跌'},
 ja:{emptyOther:'条件に合う他の市場はありません。',instrument:'市場',reference:'参考確率',points:'ポイント決済',current:'今のラウンドを取引',history:'全ラウンド',quoteHelp:'価格について',probability:'はいの確率',updated:'更新',up:'上昇',down:'下落'},
 es:{emptyOther:'No hay otros mercados que coincidan.',instrument:'Mercado',reference:'Probabilidad de referencia',points:'Liquidación en puntos',current:'Operar esta ronda',history:'Todas las rondas',quoteHelp:'Sobre los precios',probability:'Probabilidad de Sí',updated:'Actualizado',up:'Sube',down:'Baja'},
};
