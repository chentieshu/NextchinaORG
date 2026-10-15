import type {Locale} from './i18n';
const en={
 tag:'This setup',manualHint:'For manual setup, choose a time-based code. Use the entry with this setup marker.',
 invalidCode:'The authentication service rejected this code. Enter the current code for this account.',
 ipChanged:'Your network address changed during verification. Keep the same connection and try again.',
 expired:'The verification request expired. Submit a new current code to try again.',
 missing:'This setup is no longer available. Cancel it and create a new setup.',
 invalidEnrollment:'The setup data is inconsistent. Cancel this setup and try again.',
 rateLimited:'Too many attempts. Wait before trying again.',network:'Could not reach the authentication service. Check your connection and try again.',
 session:'Your sign-in session expired. Sign in again before verifying.',failed:'The security operation failed. Retry or contact support.',
 statusUnavailable:'Verification succeeded, but account status could not be refreshed. Refresh the page.',
 matched:'This code matches the current setup at your browser’s time, but the server rejected it. Contact support with diagnostic MFA_LOCAL_MATCH.',
 mismatched:'This code does not match the current setup at your browser’s time. Check both devices’ date and time. Try adding the manual setup key as a time-based entry. Diagnostic: MFA_LOCAL_MISMATCH.',
 browserTime:'Browser time when submitted'
};
export const mfaCopy:Record<Locale,typeof en>={en,
 'zh-CN':{
  tag:'本次绑定标记',manualHint:'手动添加时请选择“基于时间”，并使用带有本次绑定标记的条目。',
  invalidCode:'认证服务未接受此验证码，请输入当前账号的最新动态码。',ipChanged:'验证期间网络出口发生变化，请保持同一连接后重试。',
  expired:'验证请求已过期，请输入新的当前动态码后再次提交。',missing:'本次绑定已失效，请取消后重新设置。',invalidEnrollment:'绑定信息不一致，请取消本次设置后重试。',
  rateLimited:'尝试次数过多，请稍后再试。',network:'无法连接认证服务，请检查网络后重试。',session:'登录会话已失效，请重新登录后验证。',failed:'账号安全操作未完成，请重试或联系支持。',
  statusUnavailable:'验证已成功，但账号状态刷新失败，请刷新页面。',
  matched:'验证码与本次绑定在浏览器时间下相符，但服务器未接受。请联系支持并提供诊断编号 MFA_LOCAL_MATCH。',
  mismatched:'验证码与本次绑定在浏览器时间下不符。请核对两台设备的日期与时间，或使用下方手动密钥新增“基于时间”的条目。诊断编号：MFA_LOCAL_MISMATCH。',
  browserTime:'提交时的浏览器时间'
 },
 'zh-TW':{
  tag:'本次綁定標記',manualHint:'手動新增時請選擇「以時間為基礎」，並使用帶有本次綁定標記的項目。',
  invalidCode:'驗證服務未接受此驗證碼，請輸入目前帳號的最新動態碼。',ipChanged:'驗證期間網路出口發生變化，請保持同一連線後重試。',
  expired:'驗證請求已過期，請輸入新的動態碼後再次提交。',missing:'本次綁定已失效，請取消後重新設定。',invalidEnrollment:'綁定資訊不一致，請取消本次設定後重試。',
  rateLimited:'嘗試次數過多，請稍後再試。',network:'無法連線至驗證服務，請檢查網路後重試。',session:'登入工作階段已失效，請重新登入後驗證。',failed:'帳號安全操作未完成，請重試或聯絡支援。',
  statusUnavailable:'驗證已成功，但帳號狀態更新失敗，請重新整理頁面。',
  matched:'驗證碼與本次綁定在瀏覽器時間下相符，但伺服器未接受。請聯絡支援並提供診斷編號 MFA_LOCAL_MATCH。',
  mismatched:'驗證碼與本次綁定在瀏覽器時間下不符。請核對兩台裝置的日期與時間，或使用下方手動金鑰新增時間型項目。診斷編號：MFA_LOCAL_MISMATCH。',
  browserTime:'提交時的瀏覽器時間'
 },
 ja:{
  tag:'今回の設定識別子',manualHint:'手動設定では時間ベースを選び、この識別子の項目を使ってください。',
  invalidCode:'認証サービスがコードを受理しませんでした。このアカウントの最新コードを入力してください。',ipChanged:'認証中に接続元が変わりました。同じ接続を維持して再試行してください。',
  expired:'認証要求が期限切れです。最新コードで再試行してください。',missing:'この設定は無効です。キャンセルして設定し直してください。',invalidEnrollment:'設定情報が一致しません。キャンセルして再試行してください。',
  rateLimited:'試行回数が多すぎます。しばらくして再試行してください。',network:'認証サービスに接続できません。接続を確認してください。',session:'セッションが切れました。再ログインしてください。',failed:'セキュリティ操作が完了しませんでした。再試行するかサポートへ連絡してください。',
  statusUnavailable:'認証は成功しましたが、アカウント情報を更新できません。ページを再読み込みしてください。',
  matched:'ブラウザー時刻では今回の設定とコードが一致しますが、サーバーが拒否しました。診断番号 MFA_LOCAL_MATCH をサポートへお知らせください。',
  mismatched:'ブラウザー時刻では今回の設定とコードが一致しません。両端末の日時を確認するか、手動キーで時間ベースの項目を追加してください。診断番号: MFA_LOCAL_MISMATCH。',
  browserTime:'送信時のブラウザー時刻'
 },
 es:{
  tag:'Identificador de esta configuración',manualHint:'Al añadir la clave manualmente, elige un código basado en tiempo y usa la entrada con este identificador.',
  invalidCode:'El servicio rechazó el código. Introduce el código actual de esta cuenta.',ipChanged:'La dirección de red cambió durante la verificación. Mantén la misma conexión y reintenta.',
  expired:'La solicitud caducó. Envía un código nuevo para reintentar.',missing:'Esta configuración ya no existe. Cancélala y crea una nueva.',invalidEnrollment:'Los datos de configuración no coinciden. Cancela y reintenta.',
  rateLimited:'Demasiados intentos. Espera antes de reintentar.',network:'No se pudo conectar al servicio de autenticación. Comprueba la conexión.',session:'La sesión caducó. Vuelve a iniciar sesión.',failed:'La operación de seguridad falló. Reintenta o contacta con soporte.',
  statusUnavailable:'La verificación fue correcta, pero no se actualizó la cuenta. Recarga la página.',
  matched:'El código coincide con esta configuración según la hora del navegador, pero el servidor lo rechazó. Contacta con soporte e indica MFA_LOCAL_MATCH.',
  mismatched:'El código no coincide con esta configuración según la hora del navegador. Revisa la fecha y hora de ambos dispositivos o añade la clave manual como una entrada basada en tiempo. Diagnóstico: MFA_LOCAL_MISMATCH.',
  browserTime:'Hora del navegador al enviar'
 }
};
