'use client';
import {useEffect,useState} from 'react';
export type ThemePreference='light'|'dark'|'system';
export function useTheme(){const[preference,setPreference]=useState<ThemePreference>('system'),[dark,setDark]=useState(false);
 useEffect(()=>{const media=matchMedia('(prefers-color-scheme: dark)');function apply(){let value:ThemePreference='system';try{const stored=localStorage.getItem('omni-theme');if(stored==='light'||stored==='dark')value=stored;}catch{}const on=value==='dark'||value==='system'&&media.matches;setPreference(value);setDark(on);document.documentElement.dataset.theme=on?'dark':'light';}apply();window.addEventListener('storage',apply);window.addEventListener('nextchina-theme',apply);media.addEventListener('change',apply);return()=>{window.removeEventListener('storage',apply);window.removeEventListener('nextchina-theme',apply);media.removeEventListener('change',apply);};},[]);
 function change(value:ThemePreference){try{localStorage.setItem('omni-theme',value);}catch{}window.dispatchEvent(new Event('nextchina-theme'));}
 return {preference,dark,change,toggle:()=>change(dark?'light':'dark')};
}
