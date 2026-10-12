'use client';
import {useEffect} from 'react';
import {isLocale} from '@/lib/i18n';
export function RootRedirect(){useEffect(()=>{let saved='zh-CN';try{saved=localStorage.getItem('omni-locale')??'zh-CN';}catch{}location.replace(`/${isLocale(saved)?saved:'zh-CN'}/`);},[]);return null;}
