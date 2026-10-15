import type {Locale} from '@/lib/i18n';
const en={
 listener:'Chain listener',paymentState:'Payments',ready:'Connected',notReady:'Not ready',unknown:'Unable to confirm',
 checking:'Checking status…',saving:'Saving…',confirm:'Confirm',
 opened:'Deposits, tips and withdrawals are now open.',paused:'New deposits, tips and withdrawals are paused.',
 confirmPause:'Pause new deposits, tips and withdrawals? Existing deposits will still be reconciled.',
 mfaRequired:'Enable and complete two-factor authentication before changing payment settings.',openSecurity:'Go to two-factor authentication',
 listenerUnavailable:'No recent successful scan. Refresh the status or check the listener before opening payments.',
 gatewayMissing:'The ledger gateway is not configured. Check the service configuration before opening payments.',
 readError:'Unable to confirm the latest settings. Refresh the status before making changes.',
 accessDenied:'Only the owner administrator can change payment settings.',
 uncertain:'The change could not be confirmed. Refresh the status before retrying.',
 offline:'You are offline. Reconnect to change payment settings.',technicalHelp:'Service configuration reference'
};
export const gatewayStatusCopy:Record<Locale,typeof en>={en,
 'zh-CN':{
  listener:'链上监听',paymentState:'资金功能',ready:'连接正常',notReady:'尚未就绪',unknown:'无法确认',
  checking:'正在检查状态…',saving:'正在保存…',confirm:'确认',
  opened:'充值、打赏和提现已开放。',paused:'已暂停新增充值、打赏和提现。',
  confirmPause:'暂停新增充值、打赏和提现？已有充值仍会继续核验到账。',
  mfaRequired:'修改资金开关前，需要启用并完成双重验证。',openSecurity:'前往设置双重验证',
  listenerUnavailable:'近期没有成功扫描，请刷新状态或检查监听服务后再开放资金功能。',
  gatewayMissing:'账本网关尚未配置，请检查服务配置后再开放资金功能。',
  readError:'无法确认最新设置，请刷新状态后再操作。',
  accessDenied:'只有总管理员可以修改资金开关。',
  uncertain:'尚未确认修改结果，请先刷新状态，再决定是否重试。',
  offline:'当前处于离线状态，请恢复网络后再修改资金开关。',technicalHelp:'服务配置说明'
 },
 'zh-TW':{
  listener:'鏈上監聽',paymentState:'資金功能',ready:'連線正常',notReady:'尚未就緒',unknown:'無法確認',
  checking:'正在檢查狀態…',saving:'正在儲存…',confirm:'確認',
  opened:'儲值、打賞與提領已開放。',paused:'已暫停新增儲值、打賞與提領。',
  confirmPause:'暫停新增儲值、打賞與提領？既有儲值仍會繼續核驗入帳。',
  mfaRequired:'修改資金開關前，需要啟用並完成雙重驗證。',openSecurity:'前往設定雙重驗證',
  listenerUnavailable:'近期沒有成功掃描，請重新整理狀態或檢查監聽服務後再開放資金功能。',
  gatewayMissing:'帳本閘道尚未設定，請檢查服務設定後再開放資金功能。',
  readError:'無法確認最新設定，請重新整理狀態後再操作。',
  accessDenied:'只有總管理員可以修改資金開關。',
  uncertain:'尚未確認修改結果，請先重新整理狀態，再決定是否重試。',
  offline:'目前處於離線狀態，請恢復網路後再修改資金開關。',technicalHelp:'服務設定說明'
 },
 ja:{
  listener:'チェーン監視',paymentState:'決済',ready:'接続済み',notReady:'準備未完了',unknown:'確認できません',
  checking:'状態を確認中…',saving:'保存中…',confirm:'確認',
  opened:'入金・チップ・出金を有効にしました。',paused:'新規の入金・チップ・出金を停止しました。',
  confirmPause:'新規の入金・チップ・出金を停止しますか？既存の入金の照合は継続します。',
  mfaRequired:'決済設定を変更する前に、二要素認証を有効にして認証を完了してください。',openSecurity:'二要素認証の設定へ',
  listenerUnavailable:'最近のスキャン成功がありません。状態を更新するか、監視サービスを確認してください。',
  gatewayMissing:'台帳ゲートウェイが未設定です。決済を有効にする前に設定を確認してください。',
  readError:'最新の設定を確認できません。状態を更新してから操作してください。',
  accessDenied:'決済設定を変更できるのは最高管理者のみです。',
  uncertain:'変更結果を確認できません。状態を更新してから再試行してください。',
  offline:'オフラインです。接続を復元してから設定を変更してください。',technicalHelp:'サービス設定の説明'
 },
 es:{
  listener:'Monitor de la cadena',paymentState:'Pagos',ready:'Conectado',notReady:'No disponible',unknown:'Sin confirmar',
  checking:'Comprobando estado…',saving:'Guardando…',confirm:'Confirmar',
  opened:'Depósitos, propinas y retiros activados.',paused:'Nuevos depósitos, propinas y retiros pausados.',
  confirmPause:'¿Pausar nuevos depósitos, propinas y retiros? Se seguirán conciliando los depósitos existentes.',
  mfaRequired:'Activa y completa la autenticación de dos factores antes de cambiar los pagos.',openSecurity:'Configurar la autenticación de dos factores',
  listenerUnavailable:'No hay un escaneo correcto reciente. Actualiza el estado o comprueba el monitor antes de activar los pagos.',
  gatewayMissing:'La pasarela del libro contable no está configurada. Comprueba el servicio antes de activar los pagos.',
  readError:'No se pueden confirmar los ajustes actuales. Actualiza el estado antes de hacer cambios.',
  accessDenied:'Solo el administrador principal puede cambiar los pagos.',
  uncertain:'No se pudo confirmar el cambio. Actualiza el estado antes de reintentarlo.',
  offline:'Sin conexión. Reconéctate para cambiar los pagos.',technicalHelp:'Referencia de configuración'
 }
};
