import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
export const metadata:Metadata={title:'FUNDDAO — Gouvernance étudiante',description:'Plateforme décentralisée de gestion transparente du fonds associatif étudiant.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="fr"><body><Providers>{children}</Providers></body></html>}
