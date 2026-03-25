'use client'

import { useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Users, Plus, Upload, Trash2, Loader2, X, Search,
  CheckCircle2, AlertCircle, Tag, Phone, List, Filter,
  FolderOpen, ChevronDown,
} from 'lucide-react'
import { trpc } from '@/lib/trpc/client'

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function parseCSV(text: string): { name: string; phone: string }[] {
  const lines = text.trim().split('\n').filter(Boolean)
  const result: { name: string; phone: string }[] = []
  for (const line of lines) {
    const parts = line.split(/[,;\t]/).map((p) => p.trim().replace(/^["']|["']$/g, ''))
    const phoneIdx = parts.findIndex((p) => /\d{8,}/.test(p.replace(/\D/g, '')))
    if (phoneIdx === -1) continue
    const phone = parts[phoneIdx]
    const name = parts.find((_, i) => i !== phoneIdx && parts[i].length > 0) ?? phone
    result.push({ name: name.slice(0, 100), phone })
  }
  return result
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LIST_COLORS = [
  { value: '#6366f1', label: 'Índigo' },
  { value: '#3b82f6', label: 'Azul' },
  { value: '#10b981', label: 'Verde' },
  { value: '#f59e0b', label: 'Amarelo' },
  { value: '#f97316', label: 'Laranja' },
  { value: '#ef4444', label: 'Vermelho' },
  { value: '#ec4899', label: 'Rosa' },
  { value: '#8b5cf6', label: 'Roxo' },
]

const LIST_TYPE_SUGGESTIONS = [
  'Tatuadores', 'Médicos', 'Dentistas', 'Advogados', 'Nutricionistas',
  'Personal Trainers', 'Psicólogos', 'Esteticistas', 'Cabeleireiros',
  'Arquitetos', 'Engenheiros', 'Contadores', 'Clientes VIP', 'Leads',
]

type ContactList = {
  id: string
  name: string
  color: string
  description: string
  list_type: string
  member_count: number
}
type Contact = {
  id: string
  name: string
  phone: string
  external_id: string
  tags: string[]
  kanban_stage: string
}

const stageLabel: Record<string, string> = {
  new: 'Novo', contacted: 'Contactado', qualified: 'Qualificado',
  proposal: 'Proposta', won: 'Ganho', lost: 'Perdido',
}
const stageColor: Record<string, string> = {
  new: 'bg-gray-100 text-gray-600', contacted: 'bg-blue-100 text-blue-600',
  qualified: 'bg-yellow-100 text-yellow-700', proposal: 'bg-orange-100 text-orange-700',
  won: 'bg-green-100 text-green-700', lost: 'bg-red-100 text-red-600',
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function ContactsManager() {
  // View mode: 'all' = todos | 'list' = por lista | 'type' = por tipo
  const [viewMode, setViewMode] = useState<'all' | 'list' | 'type'>('all')
  const [activeListId, setActiveListId] = useState<string | null>(null)
  const [activeType, setActiveType] = useState<string>('')
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showNewList, setShowNewList] = useState(false)
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null)
  const [deleteListId, setDeleteListId] = useState<string | null>(null)
  const utils = trpc.useUtils()

  const { data: lists = [], isLoading: listsLoading } = trpc.contacts.getLists.useQuery()
  const { data: allTagsData = [] } = trpc.contacts.getAllTags.useQuery()

  // Compute effective listId filter
  let effectiveListId: string | undefined = undefined
  if (viewMode === 'list' && activeListId) effectiveListId = activeListId
  if (viewMode === 'type' && activeType) {
    // If filtering by type, we don't filter by specific list (show all contacts from lists of this type)
    // We'll filter client-side after getting type-related list IDs
  }

  // Get list IDs for active type (for type view)
  const typeListIds = viewMode === 'type' && activeType
    ? (lists as ContactList[]).filter((l) => l.list_type === activeType).map((l) => l.id)
    : []

  const { data, isLoading } = trpc.contacts.list.useQuery(
    {
      search,
      tag: tagFilter || undefined,
      listId: effectiveListId,
      limit: 100,
    },
    { refetchInterval: 0 }
  )

  // For type view with multiple lists, we need a different approach
  // We'll use the first matching list if multiple exist, or show all if no type filter
  const { data: typeData, isLoading: typeLoading } = trpc.contacts.list.useQuery(
    {
      search,
      tag: tagFilter || undefined,
      listId: typeListIds[0],
      limit: 100,
    },
    {
      enabled: viewMode === 'type' && typeListIds.length > 0,
      refetchInterval: 0,
    }
  )

  const contacts: Contact[] = (
    viewMode === 'type' && activeType
      ? (typeData?.contacts ?? [])
      : (data?.contacts ?? [])
  ) as Contact[]
  const total = viewMode === 'type' && activeType ? (typeData?.total ?? 0) : (data?.total ?? 0)

  const deleteContact = trpc.contacts.delete.useMutation({
    onSuccess: () => { utils.contacts.list.invalidate(); setDeleteContactId(null) },
  })
  const deleteList = trpc.contacts.deleteList.useMutation({
    onSuccess: () => {
      utils.contacts.getLists.invalidate()
      utils.contacts.list.invalidate()
      setDeleteListId(null)
      if (activeListId === deleteListId) setActiveListId(null)
    },
  })
  const removeFromList = trpc.contacts.removeFromList.useMutation({
    onSuccess: () => utils.contacts.list.invalidate(),
  })

  const typedLists = lists as ContactList[]
  const activeList = typedLists.find((l) => l.id === activeListId)

  // All unique types from existing lists
  const allTypes = [...new Set(typedLists.map((l) => l.list_type).filter(Boolean))].sort()

  // Lists grouped by type for the type view
  const listsOfActiveType = typedLists.filter((l) => l.list_type === activeType)

  function handleViewMode(mode: 'all' | 'list' | 'type') {
    setViewMode(mode)
    setActiveListId(null)
    setActiveType('')
  }

  const isLoadingContacts = viewMode === 'type' && activeType ? typeLoading : isLoading

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contatos</h1>
          <p className="text-sm text-muted-foreground">
            {total} contato{total !== 1 ? 's' : ''}
            {activeList ? ` em "${activeList.name}"` : activeType ? ` do tipo "${activeType}"` : ' no total'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            <Upload className="h-4 w-4" /> Importar CSV
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Adicionar
          </button>
        </div>
      </div>

      {/* View mode tabs */}
      <div className="flex items-center gap-1 rounded-xl border bg-muted/30 p-1 w-fit">
        <button
          onClick={() => handleViewMode('all')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            viewMode === 'all' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Users className="h-3.5 w-3.5" /> Todos
        </button>
        <button
          onClick={() => handleViewMode('list')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            viewMode === 'list' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <List className="h-3.5 w-3.5" /> Por Lista
        </button>
        <button
          onClick={() => handleViewMode('type')}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            viewMode === 'type' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <FolderOpen className="h-3.5 w-3.5" /> Por Tipo
        </button>
      </div>

      {/* List view: horizontal tabs */}
      {viewMode === 'list' && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveListId(null)}
            className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              activeListId === null ? 'bg-primary text-white border-primary' : 'bg-white hover:bg-muted'
            }`}
          >
            <Users className="h-3.5 w-3.5" /> Todas as listas
          </button>

          {typedLists.map((list) => (
            <div key={list.id} className="group relative flex shrink-0 items-center">
              <button
                onClick={() => setActiveListId(list.id)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeListId === list.id ? 'text-white border-transparent' : 'bg-white hover:bg-muted'
                }`}
                style={activeListId === list.id ? { backgroundColor: list.color, borderColor: list.color } : {}}
              >
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: list.color }} />
                {list.name}
                {list.list_type && (
                  <span className={`text-xs opacity-70`}>· {list.list_type}</span>
                )}
                <span className={`rounded-full px-1.5 py-0.5 text-xs ${activeListId === list.id ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'}`}>
                  {list.member_count}
                </span>
              </button>
              <button
                onClick={() => setDeleteListId(list.id)}
                className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white group-hover:flex"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}

          <button
            onClick={() => setShowNewList(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-dashed px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> Nova lista
          </button>
        </div>
      )}

      {/* Type view: type filter tabs + lists of that type */}
      {viewMode === 'type' && (
        <div className="space-y-3">
          {allTypes.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed p-6 text-center">
              <FolderOpen className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">Nenhum tipo criado ainda</p>
              <p className="mt-1 text-xs text-muted-foreground">Crie uma lista e defina um tipo (ex: Tatuadores, Médicos…)</p>
              <button
                onClick={() => setShowNewList(true)}
                className="mt-3 flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 mx-auto"
              >
                <Plus className="h-3.5 w-3.5" /> Nova lista com tipo
              </button>
            </div>
          ) : (
            <>
              {/* Type tabs */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {allTypes.map((type) => {
                  const typeCount = typedLists
                    .filter((l) => l.list_type === type)
                    .reduce((acc, l) => acc + l.member_count, 0)
                  return (
                    <button
                      key={type}
                      onClick={() => setActiveType(type)}
                      className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                        activeType === type ? 'bg-primary text-white border-primary' : 'bg-white hover:bg-muted'
                      }`}
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      {type}
                      <span className={`rounded-full px-1.5 py-0.5 text-xs ${activeType === type ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'}`}>
                        {typeCount}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Lists within the active type */}
              {activeType && listsOfActiveType.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 pl-2 border-l-2 border-primary/20">
                  {listsOfActiveType.map((list) => (
                    <button
                      key={list.id}
                      onClick={() => setActiveListId(list.id === activeListId ? null : list.id)}
                      className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1 text-xs font-medium transition-colors ${
                        activeListId === list.id ? 'text-white border-transparent' : 'bg-white hover:bg-muted'
                      }`}
                      style={activeListId === list.id ? { backgroundColor: list.color, borderColor: list.color } : {}}
                    >
                      <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: list.color }} />
                      {list.name}
                      <span className={`rounded-full px-1.5 py-0.5 text-xs ${activeListId === list.id ? 'bg-white/20' : 'bg-muted text-muted-foreground'}`}>
                        {list.member_count}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Filters: search + tag */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="w-full rounded-lg border bg-white pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        {/* Tag filter — always visible, loads from all contacts */}
        <div className="relative">
          <Tag className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="rounded-lg border bg-white pl-9 pr-8 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 appearance-none min-w-[160px]"
          >
            <option value="">Filtrar por tag</option>
            {allTagsData.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>
        {tagFilter && (
          <button
            onClick={() => setTagFilter('')}
            className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm text-primary hover:bg-primary/10"
          >
            <Tag className="h-3.5 w-3.5" />
            {tagFilter}
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Table */}
      {isLoadingContacts ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-white py-16 text-center">
          <Users className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="font-medium">
            Nenhum contato{activeList ? ` em "${activeList.name}"` : activeType ? ` do tipo "${activeType}"` : ''}
            {tagFilter ? ` com a tag "${tagFilter}"` : ''}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeList ? 'Importe ou adicione contatos a esta lista.' : 'Crie uma lista e importe contatos via CSV.'}
          </p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted"
            >
              <Upload className="h-3.5 w-3.5" /> Importar
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar
            </button>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/30">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Nome</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Telefone</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Tags</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">CRM</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {contacts.map((c) => (
                <tr key={c.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {c.phone ?? c.external_id}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(c.tags ?? []).map((t) => (
                        <button
                          key={t}
                          onClick={() => setTagFilter(tagFilter === t ? '' : t)}
                          className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                            tagFilter === t
                              ? 'bg-primary text-white'
                              : 'bg-primary/10 text-primary hover:bg-primary/20'
                          }`}
                        >
                          <Tag className="h-2.5 w-2.5" />{t}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${stageColor[c.kanban_stage ?? 'new'] ?? stageColor.new}`}>
                      {stageLabel[c.kanban_stage ?? 'new'] ?? 'Novo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {activeListId && (
                        <button
                          onClick={() => removeFromList.mutate({ contactId: c.id, listId: activeListId })}
                          title="Remover da lista"
                          className="rounded p-1.5 text-muted-foreground hover:bg-yellow-50 hover:text-yellow-600"
                        >
                          <List className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => setDeleteContactId(c.id)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > 100 && (
            <div className="border-t p-3 text-center text-xs text-muted-foreground">
              Mostrando 100 de {total} contatos
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {deleteContactId && (
        <ConfirmModal
          title="Excluir contato?"
          description="O histórico de conversas será mantido."
          onConfirm={() => deleteContact.mutate({ id: deleteContactId })}
          onCancel={() => setDeleteContactId(null)}
          isPending={deleteContact.isPending}
        />
      )}
      {deleteListId && (
        <ConfirmModal
          title="Excluir lista?"
          description="Os contatos não serão excluídos, apenas removidos desta lista."
          onConfirm={() => deleteList.mutate({ id: deleteListId })}
          onCancel={() => setDeleteListId(null)}
          isPending={deleteList.isPending}
        />
      )}
      {showNewList && (
        <NewListModal
          onClose={() => setShowNewList(false)}
          onSaved={(id) => {
            utils.contacts.getLists.invalidate()
            setShowNewList(false)
            setActiveListId(id)
          }}
        />
      )}
      {showAdd && (
        <AddContactModal
          lists={typedLists}
          defaultListId={activeListId}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            utils.contacts.list.invalidate()
            utils.contacts.getLists.invalidate()
            utils.contacts.getAllTags.invalidate()
            setShowAdd(false)
          }}
        />
      )}
      {showImport && (
        <ImportModal
          lists={typedLists}
          defaultListId={activeListId}
          onClose={() => setShowImport(false)}
          onSaved={() => {
            utils.contacts.list.invalidate()
            utils.contacts.getLists.invalidate()
            utils.contacts.getAllTags.invalidate()
            setShowImport(false)
          }}
        />
      )}
    </div>
  )
}

// ─── New List Modal ───────────────────────────────────────────────────────────

function NewListModal({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#6366f1')
  const [listType, setListType] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  const create = trpc.contacts.createList.useMutation({ onSuccess: (d) => onSaved(d.id) })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="font-semibold">Nova lista</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 p-6">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Nome da lista *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Tatuadores SP, Médicos Zona Sul..."
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Tipo / Categoria</label>
            <div className="relative">
              <input
                value={listType}
                onChange={(e) => setListType(e.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Ex: Tatuadores, Médicos, Dentistas..."
                className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
              {showSuggestions && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border bg-white shadow-lg">
                  {LIST_TYPE_SUGGESTIONS.filter(
                    (s) => !listType || s.toLowerCase().includes(listType.toLowerCase())
                  ).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onMouseDown={() => setListType(s)}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Agrupa listas do mesmo segmento para facilitar o filtro por tipo.
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium">Cor</label>
            <div className="flex gap-2">
              {LIST_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={`h-7 w-7 rounded-full transition-transform hover:scale-110 ${color === c.value ? 'ring-2 ring-offset-2 ring-primary' : ''}`}
                  style={{ backgroundColor: c.value }}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">
              Cancelar
            </button>
            <button
              onClick={() => create.mutate({ name, color, list_type: listType || undefined })}
              disabled={!name.trim() || create.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Criar lista
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Add Contact Modal ────────────────────────────────────────────────────────

const addSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  phone: z.string().min(8, 'Telefone inválido'),
})

function AddContactModal({ lists, defaultListId, onClose, onSaved }: {
  lists: ContactList[]
  defaultListId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [listId, setListId] = useState<string>(defaultListId ?? '')
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(addSchema) })
  const create = trpc.contacts.create.useMutation({ onSuccess: onSaved })

  function addTag() {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, '-')
    if (t && !tags.includes(t)) setTags([...tags, t])
    setTagInput('')
  }

  // Group lists by type for the select
  const groupedLists = lists.reduce<Record<string, ContactList[]>>((acc, l) => {
    const group = l.list_type || 'Sem tipo'
    if (!acc[group]) acc[group] = []
    acc[group].push(l)
    return acc
  }, {})

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="font-semibold">Adicionar contato</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form
          onSubmit={handleSubmit((d) => create.mutate({ ...d, tags, listId: listId || undefined }))}
          className="space-y-4 p-6"
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium">Nome *</label>
            <input
              {...register('name')}
              placeholder="João Silva"
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message as string}</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Telefone (WhatsApp) *</label>
            <input
              {...register('phone')}
              placeholder="11999999999"
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
            {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone.message as string}</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Adicionar à lista</label>
            <select
              value={listId}
              onChange={(e) => setListId(e.target.value)}
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Sem lista</option>
              {Object.entries(groupedLists).map(([group, groupLists]) => (
                <optgroup key={group} label={group}>
                  {groupLists.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Tags</label>
            <div className="flex gap-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                placeholder="Pressione Enter para adicionar"
                className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button type="button" onClick={addTag} className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                +
              </button>
            </div>
            {tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {tags.map((t) => (
                  <span key={t} className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                    {t}
                    <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} className="hover:text-red-500">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Adicionar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Import Modal ─────────────────────────────────────────────────────────────

function ImportModal({ lists, defaultListId, onClose, onSaved }: {
  lists: ContactList[]
  defaultListId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [step, setStep] = useState<'list' | 'csv' | 'done'>('list')
  const [selectedListId, setSelectedListId] = useState<string>(defaultListId ?? '')
  const [isNewList, setIsNewList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [newListType, setNewListType] = useState('')
  const [newListColor, setNewListColor] = useState('#6366f1')
  const [csvText, setCsvText] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null)
  const [createdListId, setCreatedListId] = useState<string | null>(null)
  const [showTypeSuggestions, setShowTypeSuggestions] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const createList = trpc.contacts.createList.useMutation({
    onSuccess: (d) => { setCreatedListId(d.id); setStep('csv') },
  })
  const importBulk = trpc.contacts.importBulk.useMutation({
    onSuccess: (data) => { setResult(data); setStep('done') },
  })

  const parsed = parseCSV(csvText)

  // Group lists by type
  const groupedLists = lists.reduce<Record<string, ContactList[]>>((acc, l) => {
    const group = l.list_type || 'Sem tipo'
    if (!acc[group]) acc[group] = []
    acc[group].push(l)
    return acc
  }, {})

  function addTag() {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, '-')
    if (t && !tags.includes(t)) setTags([...tags, t])
    setTagInput('')
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setCsvText(ev.target?.result as string)
    reader.readAsText(file, 'UTF-8')
  }

  function handleListNext() {
    if (isNewList) {
      if (!newListName.trim()) return
      createList.mutate({ name: newListName, color: newListColor, list_type: newListType || undefined })
    } else {
      setStep('csv')
    }
  }

  function handleImport() {
    const listId = createdListId ?? (selectedListId || undefined)
    importBulk.mutate({ contacts: parsed, tags, listId })
  }

  const finalListId = createdListId ?? selectedListId
  const finalListName = createdListId
    ? newListName
    : lists.find((l) => l.id === finalListId)?.name ?? ''

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 py-8">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="font-semibold">Importar contatos</h2>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span className={step === 'list' ? 'font-medium text-primary' : ''}>1. Lista</span>
              <span>→</span>
              <span className={step === 'csv' ? 'font-medium text-primary' : ''}>2. CSV</span>
              <span>→</span>
              <span className={step === 'done' ? 'font-medium text-primary' : ''}>3. Concluído</span>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {/* Step 1: Choose list */}
          {step === 'list' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Selecione uma lista existente ou crie uma nova para organizar os contatos importados.
              </p>

              <div className="space-y-2">
                {/* Use existing list */}
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${!isNewList ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                  onClick={() => setIsNewList(false)}
                >
                  <div className={`h-4 w-4 rounded-full border-2 ${!isNewList ? 'border-primary bg-primary' : 'border-muted-foreground/30'}`} />
                  <div>
                    <span className="text-sm font-medium">Usar lista existente</span>
                    <p className="text-xs text-muted-foreground">{lists.length} lista{lists.length !== 1 ? 's' : ''} disponível{lists.length !== 1 ? 'is' : ''}</p>
                  </div>
                </label>

                {!isNewList && (
                  <select
                    value={selectedListId}
                    onChange={(e) => setSelectedListId(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">Sem lista (apenas contatos)</option>
                    {Object.entries(groupedLists).map(([group, groupLists]) => (
                      <optgroup key={group} label={group}>
                        {groupLists.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name} ({l.member_count} contatos)
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                )}

                {/* Create new list */}
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${isNewList ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                  onClick={() => setIsNewList(true)}
                >
                  <div className={`h-4 w-4 rounded-full border-2 ${isNewList ? 'border-primary bg-primary' : 'border-muted-foreground/30'}`} />
                  <div>
                    <span className="text-sm font-medium">Criar nova lista</span>
                    <p className="text-xs text-muted-foreground">Organize por segmento ou campanha</p>
                  </div>
                </label>

                {isNewList && (
                  <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">Nome da lista *</label>
                      <input
                        value={newListName}
                        onChange={(e) => setNewListName(e.target.value)}
                        placeholder="Ex: Tatuadores SP, Médicos Zona Sul..."
                        className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                    <div className="relative">
                      <label className="mb-1 block text-xs font-medium text-muted-foreground">Tipo / Categoria</label>
                      <input
                        value={newListType}
                        onChange={(e) => setNewListType(e.target.value)}
                        onFocus={() => setShowTypeSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowTypeSuggestions(false), 150)}
                        placeholder="Ex: Tatuadores, Médicos, Dentistas..."
                        className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      {showTypeSuggestions && (
                        <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-36 overflow-y-auto rounded-lg border bg-white shadow-lg">
                          {LIST_TYPE_SUGGESTIONS.filter(
                            (s) => !newListType || s.toLowerCase().includes(newListType.toLowerCase())
                          ).map((s) => (
                            <button
                              key={s}
                              type="button"
                              onMouseDown={() => setNewListType(s)}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Cor</label>
                      <div className="flex gap-2">
                        {LIST_COLORS.map((c) => (
                          <button
                            key={c.value}
                            type="button"
                            onClick={() => setNewListColor(c.value)}
                            className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${newListColor === c.value ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`}
                            style={{ backgroundColor: c.value }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">
                  Cancelar
                </button>
                <button
                  onClick={handleListNext}
                  disabled={createList.isPending || (isNewList && !newListName.trim())}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
                >
                  {createList.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Próximo
                </button>
              </div>
            </div>
          )}

          {/* Step 2: CSV */}
          {step === 'csv' && (
            <div className="space-y-4">
              {finalListId && finalListName && (
                <div className="flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 text-sm">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: lists.find((l) => l.id === finalListId)?.color ?? newListColor }} />
                  Importando para: <strong>{finalListName}</strong>
                  {newListType && <span className="text-muted-foreground">· {newListType}</span>}
                </div>
              )}

              <div className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Formato: nome e telefone separados por vírgula, ponto-e-vírgula ou tab</p>
                <p className="font-mono bg-white rounded p-2">
                  João Silva,11999999999<br />
                  Maria Santos;(11) 98888-7777
                </p>
              </div>

              <div
                onClick={() => fileRef.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 hover:bg-muted/30"
              >
                <Upload className="mb-1 h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-medium">Clique para selecionar arquivo</p>
                <p className="text-xs text-muted-foreground">ou cole abaixo</p>
              </div>
              <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" />

              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                rows={4}
                placeholder={'João Silva,11999999999\nMaria Santos,11988887777'}
                className="w-full resize-none rounded-lg border px-3 py-2.5 font-mono text-xs outline-none focus:ring-2 focus:ring-primary/30"
              />

              {parsed.length > 0 && (
                <div className="rounded-xl border p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground uppercase">
                    {parsed.length} contato{parsed.length !== 1 ? 's' : ''} detectado{parsed.length !== 1 ? 's' : ''}
                  </p>
                  <div className="space-y-1">
                    {parsed.slice(0, 4).map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                        <span className="font-medium">{c.name}</span>
                        <span className="text-muted-foreground">{c.phone}</span>
                      </div>
                    ))}
                    {parsed.length > 4 && (
                      <p className="text-xs text-muted-foreground">...e mais {parsed.length - 4}</p>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium">Tags para todos os contatos</label>
                <div className="flex gap-2">
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                    placeholder="Pressione Enter para adicionar"
                    className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button type="button" onClick={addTag} className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                    +
                  </button>
                </div>
                {tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {tags.map((t) => (
                      <span key={t} className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                        {t}
                        <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} className="hover:text-red-500">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {importBulk.error && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {importBulk.error.message}
                </div>
              )}

              <div className="flex justify-between gap-2">
                <button onClick={() => setStep('list')} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">
                  ← Voltar
                </button>
                <button
                  onClick={handleImport}
                  disabled={parsed.length === 0 || importBulk.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
                >
                  {importBulk.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Importar {parsed.length > 0 ? `${parsed.length} contatos` : ''}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Done */}
          {step === 'done' && result && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
                <CheckCircle2 className="h-6 w-6 text-green-500 shrink-0" />
                <div>
                  <p className="font-semibold text-green-800">Importação concluída!</p>
                  <p className="text-sm text-green-700">
                    {result.inserted} inseridos · {result.skipped} ignorados (duplicados)
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={onSaved}
                  className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90"
                >
                  Ver contatos
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Confirm Modal ────────────────────────────────────────────────────────────

function ConfirmModal({ title, description, onConfirm, onCancel, isPending }: {
  title: string
  description: string
  onConfirm: () => void
  onCancel: () => void
  isPending: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-80 rounded-xl bg-white p-6 shadow-xl">
        <h3 className="mb-2 font-semibold">{title}</h3>
        <p className="mb-4 text-sm text-muted-foreground">{description}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-60"
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}
