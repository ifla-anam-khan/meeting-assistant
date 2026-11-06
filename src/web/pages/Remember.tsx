import { useState } from 'react'
import { ChevronDownIcon, ChevronUpIcon, XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { useRememberItems, useContacts, useDeleteRememberItem, useDeleteContact } from '@/lib/hooks'
import type { RememberItem, Contact, Space } from '@/lib/types'

function SourceQuote({ quote }: { quote: string }) {
  return (
    <p className="text-xs italic text-muted-foreground mt-1 border-l-2 border-border pl-2">
      "{quote}"
    </p>
  )
}

function RememberCard({ item, space }: { item: RememberItem; space: Space }) {
  const [open, setOpen] = useState(false)
  const deleteItem = useDeleteRememberItem()
  return (
    <div className="py-3 border-b border-border last:border-0 px-3">
      <div className="flex items-start gap-2">
        <p className="text-sm text-foreground flex-1">{item.text}</p>
        <button
          onClick={() => deleteItem.mutate({ id: item.id, space })}
          disabled={deleteItem.isPending}
          className="shrink-0 p-0.5 text-muted-foreground hover:text-destructive transition-colors"
          aria-label="Delete"
        >
          <XIcon size={13} />
        </button>
      </div>
      {item.sourceQuote && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-0.5 text-xs text-muted-foreground mt-1"
        >
          Source {open ? <ChevronUpIcon size={10} /> : <ChevronDownIcon size={10} />}
        </button>
      )}
      {open && item.sourceQuote && <SourceQuote quote={item.sourceQuote} />}
    </div>
  )
}

function ContactCard({ contact, space }: { contact: Contact; space: Space }) {
  const [open, setOpen] = useState(false)
  const deleteContact = useDeleteContact()
  return (
    <div className="py-3 border-b border-border last:border-0 px-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{contact.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{contact.topic}</p>
          {contact.notes && <p className="text-xs text-muted-foreground mt-0.5">{contact.notes}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {contact.sourceQuote && (
            <button onClick={() => setOpen((v) => !v)} className="text-muted-foreground p-0.5">
              {open ? <ChevronUpIcon size={13} /> : <ChevronDownIcon size={13} />}
            </button>
          )}
          <button
            onClick={() => deleteContact.mutate({ id: contact.id, space })}
            disabled={deleteContact.isPending}
            className="p-0.5 text-muted-foreground hover:text-destructive transition-colors"
            aria-label="Delete"
          >
            <XIcon size={13} />
          </button>
        </div>
      </div>
      {open && contact.sourceQuote && <SourceQuote quote={contact.sourceQuote} />}
    </div>
  )
}

const SECTION_CONFIG = [
  { key: 'decision', label: 'Decisions' },
  { key: 'open-question', label: 'Open Questions' },
  { key: 'follow-up', label: 'Follow-ups' },
  { key: 'fact', label: 'Key Facts' },
] as const

export default function Remember() {
  const { space } = useAppStore()

  const { data: items, isLoading: loadingItems, isError: errorItems } = useRememberItems('work')
  const { data: contactList, isLoading: loadingContacts, isError: errorContacts } = useContacts('work')

  if (space === 'personal') {
    return (
      <div className="p-4 max-w-2xl mx-auto text-sm text-muted-foreground">
        Switch to Work space to view decisions and contacts.
      </div>
    )
  }

  const isLoading = loadingItems || loadingContacts
  const isError = errorItems || errorContacts

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-foreground">Remember</h1>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {isError && <p className="text-sm text-destructive">Could not load data.</p>}

      {/* Remember items by type */}
      {!isLoading && SECTION_CONFIG.map(({ key, label }) => {
        const section = (items ?? []).filter((i) => i.type === key)
        return (
          <div key={key}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              {label} {section.length > 0 && <span className="font-normal">({section.length})</span>}
            </h2>
            <div className={cn(
              'rounded-xl border bg-card',
              section.length === 0 ? 'border-dashed border-border' : 'border-border',
            )}>
              {section.length === 0
                ? <p className="px-3 py-3 text-sm text-muted-foreground">None yet.</p>
                : section.map((item) => <RememberCard key={item.id} item={item} space="work" />)
              }
            </div>
          </div>
        )
      })}

      {/* Contacts */}
      {!isLoading && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
            Contacts {(contactList ?? []).length > 0 && <span className="font-normal">({contactList!.length})</span>}
          </h2>
          <div className={cn(
            'rounded-xl border bg-card',
            (contactList ?? []).length === 0 ? 'border-dashed border-border' : 'border-border',
          )}>
            {(contactList ?? []).length === 0
              ? <p className="px-3 py-3 text-sm text-muted-foreground">No contacts captured yet.</p>
              : contactList!.map((c) => <ContactCard key={c.id} contact={c} space="work" />)
            }
          </div>
        </div>
      )}
    </div>
  )
}
