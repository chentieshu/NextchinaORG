'use client';
import type {ReactNode} from 'react';
import {FiInfo} from 'react-icons/fi';
import {useApp} from './Provider';

const labels={'zh-CN':'说明','zh-TW':'說明',en:'Details',ja:'詳細',es:'Detalles'};
export function HelpDisclosure({children,label}:{children:ReactNode;label?:string}){
 const{locale}=useApp();
 return <details className="help-disclosure"><summary><FiInfo aria-hidden="true"/>{label??labels[locale]}</summary><div>{children}</div></details>;
}
