import { ReferralProgram } from '@/components/settings/ReferralProgram'

export const metadata = { title: 'Programa de Afiliados' }

export default function ReferralsPage() {
  return (
    <div className="mx-auto max-w-2xl py-6 px-4">
      <ReferralProgram />
    </div>
  )
}
