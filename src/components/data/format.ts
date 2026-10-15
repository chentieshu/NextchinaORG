export const formatCount=(n:number,locale:string)=>new Intl.NumberFormat(locale).format(n);
export const compactCount=(n:number,locale:string)=>new Intl.NumberFormat(locale,{notation:'compact',maximumFractionDigits:1}).format(n);
export function formatBytes(n:number,locale:string,maximumFractionDigits=2){const index=n>=1099511627776?4:n>=1073741824?3:n>=1048576?2:n>=1024?1:0;return new Intl.NumberFormat(locale,{maximumFractionDigits}).format(n/1024**index)+' '+['B','KiB','MiB','GiB','TiB'][index];}
