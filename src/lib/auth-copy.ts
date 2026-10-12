import type {Locale} from './i18n';
export const authCopy:Record<Locale,{unavailable:string;loadError:string}>={
 'zh-CN':{unavailable:'暂未开放',loadError:'暂时无法获取登录方式，请重试。'},
 en:{unavailable:'Coming soon',loadError:'Unable to load sign-in options. Please try again.'},
 ja:{unavailable:'準備中',loadError:'ログイン方法を読み込めません。もう一度お試しください。'},
 es:{unavailable:'Próximamente',loadError:'No se pudieron cargar las opciones de acceso. Inténtalo de nuevo.'},
 'zh-TW':{unavailable:'暫未開放',loadError:'暫時無法取得登入方式，請重試。'}
};
