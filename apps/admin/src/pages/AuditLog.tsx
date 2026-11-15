import { useMemo, useState } from 'react'
import { Button, Card, Empty, LoadState, PageHeader, SearchInput, td, th } from '../components/ui'
import { toast } from '../components/toast'
import { auditApi, useLoad } from '../lib/content'
import { timeAgo } from '../lib/format'

export function AuditLog() {
  const { data, loading, error, reload, set } = useLoad(() => auditApi.page())
  const [q, setQ] = useState('')
  const [more, setMore] = useState(false)

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (data?.entries ?? []).filter((a) => !needle || `${a.action} ${a.target} ${a.actor} ${a.detail ?? ''}`.toLowerCase().includes(needle))
  }, [data, q])

  const loadMore = async () => {
    if (!data?.next) return
    setMore(true)
    try {
      const page = await auditApi.page(data.next)
      set((d) => ({ entries: [...d.entries, ...page.entries], next: page.next }))
    } catch (err) { toast(err instanceof Error ? err.message : 'Could not load more', 'error') } finally { setMore(false) }
  }

  return (
    <div className="fade-in">
      <PageHeader
        title="Audit log" sub="Every admin sign-in and content change, newest first. Entries cannot be edited or deleted."
        actions={<Button icon="refresh" onClick={reload} disabled={loading}>Refresh</Button>}
      />
      <Card>
        <div className="border-b border-line p-4"><SearchInput value={q} onChange={setQ} placeholder="Search loaded entries" /></div>
        {!data ? <LoadState loading={loading} error={error} onRetry={reload} /> : rows.length === 0 ? <Empty title="Nothing here yet" body={q ? 'No loaded entries match your search.' : 'Admin actions will appear as they happen.'} /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-ink-2/60"><tr><th className={th}>When</th><th className={th}>Action</th><th className={th}>Item</th><th className={th}>Details</th><th className={th}>By</th></tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map((a) => (
                  <tr key={a.id} className="hover:bg-ink-2/60">
                    <td className={`${td} whitespace-nowrap text-muted`} title={new Date(a.at).toLocaleString()}>{timeAgo(a.at)}</td>
                    <td className={`${td} font-medium text-heading`}>{a.action}</td>
                    <td className={`${td} text-text`}>{a.target}</td>
                    <td className={`${td} max-w-xs text-xs text-muted`}>{a.detail ?? ''}</td>
                    <td className={`${td} text-muted`}>{a.actor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data?.next && <div className="border-t border-line p-4 text-center"><Button onClick={() => void loadMore()} disabled={more}>{more ? 'Loading…' : 'Load older entries'}</Button></div>}
      </Card>
    </div>
  )
}
