import React from 'react'

type BrandingConfig = {
  logoUrl?: string
  companyName?: string
  address?: string
  website?: string
  email?: string
  footerText?: string
}

type Props = {
  branding?: BrandingConfig
}

export default function CompanyLetterhead({ branding }: Props) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
        }}
      >
        <div style={{ minWidth: 120 }}>
          {branding?.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt="Company logo"
              style={{ maxHeight: 64, maxWidth: 180, objectFit: 'contain' }}
            />
          ) : null}
        </div>

        <div style={{ textAlign: 'right', fontSize: 13, color: 'var(--text2)' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
            {branding?.companyName || 'Company'}
          </div>
          {branding?.address && <div>{branding.address}</div>}
          {branding?.website && <div>{branding.website}</div>}
          {branding?.email && <div>{branding.email}</div>}
        </div>
      </div>

      <div style={{ marginTop: 12, borderBottom: '2px solid #c9a14a' }} />
    </div>
  )
}
