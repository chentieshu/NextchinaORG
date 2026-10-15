import type {ButtonHTMLAttributes,ReactNode} from 'react';
import {FiChevronDown} from 'react-icons/fi';

export function IconButton({label,children,className='',type='button',...props}:ButtonHTMLAttributes<HTMLButtonElement>&{label:string;children:ReactNode}){
 return <button {...props} type={type} className={`icon-button icon-control ${className}`} aria-label={label} title={label}>{children}</button>;
}

// Keep native select behavior for keyboard, touch and assistive technology.
export function IconSelect({label,value,onChange,options,icon,disabled=false}:{label:string;value:string;onChange:(value:string)=>void;options:{value:string;label:string}[];icon:ReactNode;disabled?:boolean}){
 const selected=options.find(option=>option.value===value)?.label??'',hint=`${label} · ${selected}`;
 return <span className={`icon-select ${disabled?'is-disabled':''}`} title={hint}><span className="icon-select-symbol" aria-hidden="true">{icon}<FiChevronDown className="select-caret"/></span><select aria-label={label} title={hint} value={value} disabled={disabled} onChange={event=>onChange(event.target.value)}>{options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></span>;
}
