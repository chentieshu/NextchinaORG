'use client';
import {useApp} from './Provider';
import {RichEditor} from './RichEditor';
import {experienceCopy} from '@/lib/experience-copy';
import {normalizeDocument} from '@/lib/rich-content';
import type {RichNode} from '@/lib/types';
export type CommentValue={body:string;document:RichNode};
export function CommentEditor({value,onChange,disabled=false}:{value:CommentValue;onChange:(value:CommentValue)=>void;disabled?:boolean}){const{locale}=useApp();return <RichEditor document={normalizeDocument(value.document,value.body,true)} locale={locale} compact label={experienceCopy[locale].comment} maxLength={2000} disabled={disabled} onChange={(document,body)=>onChange({document,body})}/>;}
