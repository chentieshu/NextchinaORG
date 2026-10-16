import type {Locale} from '@/lib/i18n';
const en={markets:'All markets',portfolio:'My positions',history:'Past rounds',switched:'New round opened. The order form has been reset.',pending:'A new round is available. Finish reviewing the previous action before switching.',waiting:'Waiting for the current round',trade:'Order',chart:'Chart',details:'Price source & details'};
export const liveCopy:Record<Locale,typeof en>={en,
 'zh-CN':{markets:'全部市场',portfolio:'我的持仓',history:'历史轮次',switched:'已进入新一轮，下单表单已重置。',pending:'新一轮已开始，请先完成上一笔操作的核对。',waiting:'等待当前轮次',trade:'下单',chart:'行情',details:'行情来源与说明'},
 'zh-TW':{markets:'全部市場',portfolio:'我的持倉',history:'歷史輪次',switched:'已進入新一輪，下單表單已重設。',pending:'新一輪已開始，請先完成上一筆操作的核對。',waiting:'等待目前輪次',trade:'下單',chart:'行情',details:'行情來源與說明'},
 ja:{markets:'すべての市場',portfolio:'保有ポジション',history:'過去のラウンド',switched:'新ラウンドに切り替わり、注文フォームをリセットしました。',pending:'新ラウンドが始まりました。前の操作を確認してから切り替わります。',waiting:'現在のラウンドを待っています',trade:'注文',chart:'チャート',details:'価格情報と詳細'},
 es:{markets:'Todos los mercados',portfolio:'Mis posiciones',history:'Rondas anteriores',switched:'Nueva ronda. Se ha restablecido el formulario de orden.',pending:'Hay una nueva ronda. Completa la revisión de la operación anterior para cambiar.',waiting:'Esperando la ronda actual',trade:'Operar',chart:'Gráfico',details:'Fuente y detalles'},
};
