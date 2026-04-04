import { useMemo, useState } from 'react'
import Head from 'next/head'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/lib/auth-context'
import { fmtC, fmtDate, fmtN } from '@/lib/utils'

type VestingRow = {
  id?: string
  vestDate?: string
  date?: string
  optionsCount?: number
  quantity?: number
}

type Props = {
  grant: any
  employee: any
  company: any
  vestingEvents?: VestingRow[]
  companyId?: string
  onGrantUpdated?: (updates: Record<string, any>) => void
}

const formatAcceptanceDateTime = (value: any) => {
  if (!value) return ''
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const day = String(date.getDate()).padStart(2, '0')
  const month = date.toLocaleString('en-GB', { month: 'short' })
  const year = date.getFullYear()
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${day} ${month} ${year} & ${hour}:${minute}`
}

export default function GrantLetterView({
  grant,
  employee,
  company,
  vestingEvents = [],
  companyId,
  onGrantUpdated,
}: Props) {
  const { user, profile } = useAuth()
  const [actionBusy, setActionBusy] = useState(false)
  const [toast, setToast] = useState('')

  const grantDocPathCompanyId = companyId || profile?.companyId || grant?.companyId || company?.id

  const schedule = useMemo(() => {
    if (vestingEvents.length > 0) {
      return [...vestingEvents]
        .sort((a, b) => String(a.vestDate || a.date || '').localeCompare(String(b.vestDate || b.date || '')))
        .map((ev) => ({
          date: ev.vestDate || ev.date,
          options: ev.optionsCount || ev.quantity || 0,
        }))
    }

    if (Array.isArray(grant?.vestingSchedule)) {
      return grant.vestingSchedule.map((row: any) => ({
        date: row.date,
        options: row.quantity || row.optionsCount || 0,
      }))
    }

    return []
  }, [vestingEvents, grant?.vestingSchedule])

  const status = grant?.status || 'issued'
  const isAccepted = status === 'accepted'
  const isRejected = status === 'rejected'
  const isFinal = isAccepted || isRejected

  const updateGrantStatus = async (nextStatus: 'accepted' | 'rejected') => {
    if (!grant?.id || !grantDocPathCompanyId || actionBusy || isFinal) return
    setActionBusy(true)
    setToast('')

    try {
      const updates: Record<string, any> = {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      }

      if (nextStatus === 'accepted') {
        updates.acceptedAt = serverTimestamp()
        updates.acceptedBy = user?.email || profile?.email || ''
        updates.locked = true
      } else {
        updates.rejectedAt = serverTimestamp()
      }

      await updateDoc(doc(db, 'companies', grantDocPathCompanyId, 'grants', grant.id), updates)
      onGrantUpdated?.(updates)
      setToast(nextStatus === 'accepted' ? 'Grant accepted successfully' : 'Grant rejected successfully')
    } catch (error) {
      setToast('Could not update grant status. Please try again.')
    }

    setActionBusy(false)
  }

  const generateGrantPDF = () => {
    const content = document.getElementById('grant-letter-container')

    if (!content) {
      alert('Grant content not found')
      return
    }

    const printWindow = window.open('', '_blank')

    if (!printWindow) {
      alert('Popup blocked. Please allow popups.')
      return
    }

    printWindow.document.write(`
    <html>
      <head>
        <title>Grant Letter</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 20px;
            color: #000;
          }

          h2, h3 {
            margin-top: 20px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
          }

          th, td {
            padding: 8px;
            border: 1px solid #ddd;
          }

          th {
            background: #f3f4f6;
          }

          .letterhead {
            border-bottom: 2px solid #c9a14a;
            margin-bottom: 20px;
            padding-bottom: 10px;
          }

          .accepted-stamp {
            margin-top: 10px;
            padding: 6px 10px;
            background: #e6f4ea;
            color: #1e7e34;
            display: inline-block;
            border-radius: 4px;
          }

          .no-print {
            display: none;
          }

          @media print {
            body {
              margin: 0;
            }
          }
        </style>
      </head>
      <body>
        ${content.innerHTML}
      </body>
    </html>
  `)

    printWindow.document.close()

    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 500)
  }

  return (
    <>
      <Head>
        <title>Grant Letter</title>
      </Head>
      <div
        style={{
          maxWidth: 900,
          margin: '0 auto',
          border: '1px solid var(--border)',
          borderRadius: 12,
          background: 'var(--bg)',
          overflow: 'hidden',
        }}
      >
        <div
          id="grant-letter-container"
          style={{
            maxHeight: 'none',
            overflow: 'visible',
            scrollBehavior: 'smooth',
            padding: 24,
            lineHeight: 1.65,
          }}
        >
          <div className="pdf-content">
            <div style={{ marginBottom: 20 }}>
              <h2 style={{ marginBottom: 6 }}>{company?.companyName || company?.name || 'Company'}</h2>
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>{company?.address || '—'}</div>
            </div>

            <h3 style={{ marginBottom: 10 }}>Grant Details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginBottom: 20 }}>
              <div><strong>Employee Name:</strong> {employee?.name || grant?.employeeName || '—'}</div>
              <div><strong>Grant Ref:</strong> {grant?.grantNumber || grant?.ref || grant?.id}</div>
              <div><strong>Grant Date:</strong> {fmtDate(grant?.grantDate)}</div>
              <div><strong>Options:</strong> {fmtN(grant?.totalOptions || 0)}</div>
              <div><strong>Exercise Price:</strong> {fmtC(grant?.exercisePrice || 0)}</div>
            </div>

            <h3 style={{ marginBottom: 10 }}>Vesting Schedule</h3>
            <table className="tbl" style={{ marginBottom: 24, pageBreakInside: 'avoid' }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Options</th>
                </tr>
              </thead>
              <tbody>
                {schedule.length === 0 ? (
                  <tr>
                    <td colSpan={2} style={{ color: 'var(--text3)' }}>No vesting schedule available.</td>
                  </tr>
                ) : (
                  schedule.map((row, idx) => (
                    <tr key={`${row.date}-${idx}`}>
                      <td>{fmtDate(row.date)}</td>
                      <td>{fmtN(row.options)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <h3 style={{ marginBottom: 8 }}>Signature</h3>
            <div style={{ marginBottom: 20 }}>
              <div>Authorized Signatory: {company?.signatoryName || '________________'}</div>
              <div>Designation: {company?.signatoryTitle || '________________'}</div>
            </div>

            <h3 style={{ marginBottom: 8 }}>Employee Acceptance</h3>
            {isAccepted ? (
              <div style={{ marginBottom: 20 }}>
                <p>
                  I, {employee?.name || grant?.employeeName || 'Employee'}, hereby accept the grant of {fmtN(grant?.totalOptions || 0)} stock options under Grant Ref: {grant?.grantNumber || grant?.ref || grant?.id}
                </p>
                <p style={{ color: '#2d7a4f', fontWeight: 700 }}>
                  ✔ Digitally accepted on {formatAcceptanceDateTime(grant?.acceptedAt)}
                </p>
                <div>Employee Signature: ____________________</div>
                <div>Date: {formatAcceptanceDateTime(grant?.acceptedAt).split(' & ')[0] || '____________________'}</div>
              </div>
            ) : (
              <div style={{ marginBottom: 20 }}>
                <div>Employee Signature: ____________________</div>
                <div>Date: ____________________</div>
              </div>
            )}

            {!!company?.tandcTemplate && (
              <>
                <h3 style={{ marginBottom: 8 }}>Annexure / Terms</h3>
                <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text2)' }}>{company.tandcTemplate}</div>
              </>
            )}
          </div>
        </div>

        <div
          style={{
            position: 'sticky',
            bottom: 0,
            borderTop: '1px solid var(--border)',
            background: 'var(--bg2)',
            padding: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontSize: 12, color: isAccepted ? '#2d7a4f' : 'var(--text2)' }}>
            {isAccepted ? 'This grant has already been accepted.' : isRejected ? 'This grant has been rejected.' : 'Review the full letter before taking action.'}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" onClick={generateGrantPDF}>Print / Save as PDF</button>
            {!isFinal && (
              <>
                <button className="btn btn-danger btn-sm" onClick={() => updateGrantStatus('rejected')} disabled={actionBusy}>Reject Grant</button>
                <button className="btn btn-success btn-sm" onClick={() => updateGrantStatus('accepted')} disabled={actionBusy}>Accept Grant</button>
              </>
            )}
          </div>
        </div>
      </div>

      {toast && <div className="alert alert-success" style={{ marginTop: 12 }}>{toast}</div>}
    </>
  )
}
