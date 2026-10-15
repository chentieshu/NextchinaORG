export type Datum={label:string;value:number;display?:string};
export type DistributionProps={items:Datum[];locale:string;unit?:'bytes'};
export type ContentChartProps={rows:{label:string;published:number;draft:number;archived:number}[];names:{published:string;draft:string;archived:string};locale:string};
export type CompositionProps={items:Datum[];locale:string;center?:string};
