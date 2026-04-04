'use client'

import { useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Users, Plus, Upload, Trash2, Loader2, X, Search,
  CheckCircle2, AlertCircle, Tag, Phone, List, Filter,
  FolderOpen, ChevronDown, ChevronRight, LayoutList, Table2,
  Megaphone, MapPin, Globe, Building2, Pencil, Check,
} from 'lucide-react'
import { trpc } from '@/lib/trpc/client'

// ─── Tag helpers ──────────────────────────────────────────────────────────────

const PRESET_TAGS = [
  { label: 'Hot Lead',      cls: 'bg-red-100 text-red-700 border-red-200' },
  { label: 'Cold Lead',     cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  { label: 'VIP',           cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  { label: 'Suporte',       cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  { label: 'Venda',         cls: 'bg-green-100 text-green-700 border-green-200' },
  { label: 'Reclamação',    cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  { label: 'Parceiro',      cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  { label: 'Inativo',       cls: 'bg-gray-100 text-gray-500 border-gray-200' },
  { label: 'Sem interesse', cls: 'bg-rose-100 text-rose-700 border-rose-200' },
]

function getTagCls(tag: string) {
  return PRESET_TAGS.find((t) => t.label === tag)?.cls ?? 'bg-indigo-100 text-indigo-700 border-indigo-200'
}

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

const LIST_TAG_PREFIX = '_list:'

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
  company_name?: string | null
  address?: string | null
  website?: string | null
  specialties?: string | null
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
  // Display mode: 'table' = tabela plana | 'grouped' = agrupado por lista
  const [displayMode, setDisplayMode] = useState<'table' | 'grouped'>('table')
  const [activeListId, setActiveListId] = useState<string | null>(null)
  const [activeType, setActiveType] = useState<string>('')
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showNewList, setShowNewList] = useState(false)
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null)
  const [deleteListId, setDeleteListId] = useState<string | null>(null)
  const [editContact, setEditContact] = useState<Contact | null>(null)
  const [showMapsSearch, setShowMapsSearch] = useState(false)
  const [moveContactId, setMoveContactId] = useState<string | null>(null)
  const [moveFromListId, setMoveFromListId] = useState<string>('')
  const [moveToListId, setMoveToListId] = useState<string>('')
  const [renamingListId, setRenamingListId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const utils = trpc.useUtils()

  const { data: lists = [], isLoading: listsLoading } = trpc.contacts.getLists.useQuery()

  const renameList = trpc.contacts.renameList.useMutation({
    onSuccess: () => { utils.contacts.getLists.invalidate(); setRenamingListId(null) },
  })
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
  const moveToList = trpc.contacts.moveToList.useMutation({
    onSuccess: () => { utils.contacts.list.invalidate(); setMoveContactId(null); setMoveFromListId(''); setMoveToListId('') },
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
          {/* Display mode toggle */}
          <div className="flex items-center rounded-lg border bg-muted/30 p-0.5">
            <button
              onClick={() => setDisplayMode('table')}
              title="Visualização em tabela"
              className={`rounded p-1.5 transition-colors ${displayMode === 'table' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <Table2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setDisplayMode('grouped')}
              title="Agrupado por lista"
              className={`rounded p-1.5 transition-colors ${displayMode === 'grouped' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              <LayoutList className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={() => setShowMapsSearch(true)}
            className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            <MapPin className="h-4 w-4" /> Buscar no Maps
          </button>
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
              {renamingListId === list.id ? (
                <div className="flex items-center gap-1 rounded-lg border bg-white px-2 py-1">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: list.color }} />
                  <input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') renameList.mutate({ id: list.id, name: renameValue })
                      if (e.key === 'Escape') setRenamingListId(null)
                    }}
                    className="w-28 text-sm outline-none"
                    autoFocus
                  />
                  <button onClick={() => renameList.mutate({ id: list.id, name: renameValue })} className="text-primary">
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => setRenamingListId(null)} className="text-muted-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
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
                    <span className="text-xs opacity-70">· {list.list_type}</span>
                  )}
                  <span className={`rounded-full px-1.5 py-0.5 text-xs ${activeListId === list.id ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'}`}>
                    {list.member_count}
                  </span>
                </button>
              )}
              {renamingListId !== list.id && (
                <button
                  onClick={(e) => { e.stopPropagation(); setRenameValue(list.name); setRenamingListId(list.id) }}
                  className="absolute -left-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-white group-hover:flex"
                  title="Renomear"
                >
                  <Pencil className="h-2.5 w-2.5" />
                </button>
              )}
              {renamingListId !== list.id && (
                <button
                  onClick={() => setDeleteListId(list.id)}
                  className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white group-hover:flex"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              )}
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

      {/* Grouped view */}
      {displayMode === 'grouped' ? (
        <GroupedListView
          lists={typedLists}
          search={search}
          tagFilter={tagFilter}
          onTagClick={(t) => setTagFilter(tagFilter === t ? '' : t)}
          onNewList={() => setShowNewList(true)}
          onImport={() => setShowImport(true)}
        />
      ) : (
        /* Table view */
        isLoadingContacts ? (
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide hidden md:table-cell">Empresa</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Telefone</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Endereço</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Tags</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">CRM</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {contacts.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="font-medium">{c.name}</div>
                      {c.website && (
                        <a href={c.website.startsWith('http') ? c.website : `https://${c.website}`} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-0.5 text-xs text-primary hover:underline mt-0.5">
                          <Globe className="h-2.5 w-2.5" />{c.website.replace(/^https?:\/\//, '').split('/')[0]}
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">
                      {c.company_name && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3 shrink-0" />
                          {c.company_name}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {c.phone ?? c.external_id}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell max-w-[180px]">
                      {c.address && (
                        <span className="flex items-start gap-1">
                          <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                          <span className="truncate">{c.address}</span>
                        </span>
                      )}
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
                        <button
                          onClick={() => { setMoveContactId(c.id); setMoveFromListId(activeListId ?? ''); setMoveToListId('') }}
                          title="Mover para lista"
                          className="rounded p-1.5 text-muted-foreground hover:bg-purple-50 hover:text-purple-600"
                        >
                          <FolderOpen className="h-4 w-4" />
                        </button>
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
                          onClick={() => setEditContact(c)}
                          title="Editar contato"
                          className="rounded p-1.5 text-muted-foreground hover:bg-blue-50 hover:text-blue-600"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
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
        )
      )}

      {/* Modals */}
      {editContact && (
        <EditContactModal
          contact={editContact}
          onClose={() => setEditContact(null)}
          onSaved={() => { utils.contacts.list.invalidate(); setEditContact(null) }}
        />
      )}
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
      {moveContactId && (() => {
        const movingContact = contacts.find((c) => c.id === moveContactId)
        const contactListIds = (movingContact?.tags ?? [])
          .filter((t: string) => t.startsWith(LIST_TAG_PREFIX))
          .map((t: string) => t.replace(LIST_TAG_PREFIX, ''))
        const contactCurrentLists = typedLists.filter((l) => contactListIds.includes(l.id))
        const availableDestinations = typedLists.filter((l) => l.id !== moveFromListId)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b px-6 py-4">
                <h3 className="font-semibold">Mover contato de lista</h3>
                <button onClick={() => setMoveContactId(null)} className="rounded-lg p-1 hover:bg-muted">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4 p-6">
                {/* Contact name */}
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{movingContact?.name ?? 'Contato'}</span>
                </p>

                {/* From list */}
                <div>
                  <label className="mb-1 block text-sm font-medium">Remover de</label>
                  <select
                    value={moveFromListId}
                    onChange={(e) => setMoveFromListId(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">— Não remover de nenhuma lista —</option>
                    {contactCurrentLists.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>

                {/* To list */}
                <div>
                  <label className="mb-1 block text-sm font-medium">Adicionar a</label>
                  <select
                    value={moveToListId}
                    onChange={(e) => setMoveToListId(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <option value="">Selecione a lista de destino...</option>
                    {availableDestinations.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={() => setMoveContactId(null)} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">Cancelar</button>
                  <button
                    disabled={!moveToListId || moveToList.isPending}
                    onClick={() => moveToList.mutate({
                      contactIds: [moveContactId],
                      toListId: moveToListId,
                      fromListId: moveFromListId || undefined,
                    })}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
                  >
                    {moveToList.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {moveFromListId ? 'Mover' : 'Adicionar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
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
      {showMapsSearch && (
        <MapsSearchModal
          lists={typedLists}
          defaultListId={activeListId}
          onClose={() => setShowMapsSearch(false)}
          onSaved={() => {
            utils.contacts.list.invalidate()
            utils.contacts.getLists.invalidate()
            utils.contacts.getAllTags.invalidate()
            setShowMapsSearch(false)
          }}
        />
      )}
    </div>
  )
}

// ─── Grouped List View ────────────────────────────────────────────────────────

function GroupedListView({ lists, search, tagFilter, onTagClick, onNewList, onImport }: {
  lists: ContactList[]
  search: string
  tagFilter: string
  onTagClick: (tag: string) => void
  onNewList: () => void
  onImport: () => void
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  function toggle(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  if (lists.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed bg-white py-16 text-center">
        <LayoutList className="mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="font-medium">Nenhuma lista criada</p>
        <p className="mt-1 text-sm text-muted-foreground">Crie uma lista e importe contatos via CSV.</p>
        <div className="mt-4 flex gap-2">
          <button onClick={onImport} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-muted">
            <Upload className="h-3.5 w-3.5" /> Importar
          </button>
          <button onClick={onNewList} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90">
            <Plus className="h-3.5 w-3.5" /> Nova lista
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {lists.map((list) => (
        <ListAccordion
          key={list.id}
          list={list}
          isOpen={!!expanded[list.id]}
          onToggle={() => toggle(list.id)}
          search={search}
          tagFilter={tagFilter}
          onTagClick={onTagClick}
        />
      ))}
    </div>
  )
}

function ListAccordion({ list, isOpen, onToggle, search, tagFilter, onTagClick }: {
  list: ContactList
  isOpen: boolean
  onToggle: () => void
  search: string
  tagFilter: string
  onTagClick: (tag: string) => void
}) {
  const { data, isLoading } = trpc.contacts.list.useQuery(
    { search, tag: tagFilter || undefined, listId: list.id, limit: 100 },
    { enabled: isOpen, refetchInterval: 0 }
  )
  const contacts = (data?.contacts ?? []) as Contact[]
  const total = data?.total ?? list.member_count

  // Collect unique tags from loaded contacts
  const listTags = isOpen
    ? [...new Set(contacts.flatMap((c) => c.tags ?? []))].sort()
    : []

  return (
    <div className="overflow-hidden rounded-xl border bg-white">
      {/* Accordion header */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/20 transition-colors"
      >
        <span
          className="h-3 w-3 rounded-full shrink-0"
          style={{ backgroundColor: list.color }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{list.name}</span>
            {list.list_type && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {list.list_type}
              </span>
            )}
          </div>
          {/* Tags preview when collapsed */}
          {!isOpen && listTags.length === 0 && list.member_count > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">Expandir para ver tags</p>
          )}
          {!isOpen && listTags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {listTags.slice(0, 5).map((t) => (
                <span key={t} className="rounded-full bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            {total} contato{total !== 1 ? 's' : ''}
          </span>
          {/* Campaign shortcut */}
          <a
            href={`/campaigns?listId=${list.id}`}
            onClick={(e) => e.stopPropagation()}
            title="Criar campanha para esta lista"
            className="flex items-center gap-1 rounded-lg border px-2 py-1 text-xs text-muted-foreground hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-colors"
          >
            <Megaphone className="h-3 w-3" />
            Campanha
          </a>
          {isOpen
            ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
            : <ChevronRight className="h-4 w-4 text-muted-foreground" />
          }
        </div>
      </button>

      {/* Accordion body */}
      {isOpen && (
        <div className="border-t">
          {/* Tags filter chips */}
          {listTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-b bg-muted/20 px-4 py-2">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Tag className="h-3 w-3" /> Tags:
              </span>
              {listTags.map((t) => (
                <button
                  key={t}
                  onClick={() => onTagClick(t)}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                    tagFilter === t
                      ? 'bg-primary text-white'
                      : 'bg-primary/10 text-primary hover:bg-primary/20'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : contacts.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Nenhum contato{tagFilter ? ` com a tag "${tagFilter}"` : ''} nesta lista.
            </div>
          ) : (
            <div className="divide-y">
              {contacts.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/10">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {c.name?.charAt(0)?.toUpperCase() ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.phone ?? c.external_id}</p>
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {(c.tags ?? []).map((t) => (
                      <button
                        key={t}
                        onClick={() => onTagClick(t)}
                        className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors ${
                          tagFilter === t
                            ? 'bg-primary text-white'
                            : 'bg-primary/10 text-primary hover:bg-primary/20'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${stageColor[c.kanban_stage ?? 'new'] ?? stageColor.new}`}>
                    {stageLabel[c.kanban_stage ?? 'new'] ?? 'Novo'}
                  </span>
                </div>
              ))}
              {total > 100 && (
                <div className="px-4 py-2 text-center text-xs text-muted-foreground">
                  Mostrando 100 de {total} contatos
                </div>
              )}
            </div>
          )}
        </div>
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

// ─── Edit Contact Modal ───────────────────────────────────────────────────────

function EditContactModal({ contact, onClose, onSaved }: {
  contact: Contact
  onClose: () => void
  onSaved: () => void
}) {
  // Separate user tags from internal _list: tags to preserve them on save
  const listTagsRaw = (contact.tags ?? []).filter((t: string) => t.startsWith('_list:'))
  const [userTags, setUserTags] = useState<string[]>((contact.tags ?? []).filter((t: string) => !t.startsWith('_list:')))
  const [tagInput, setTagInput] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      name: contact.name,
      company_name: contact.company_name ?? '',
      address: contact.address ?? '',
      website: contact.website ?? '',
      specialties: contact.specialties ?? '',
    },
  })
  const update = trpc.contacts.update.useMutation({ onSuccess: onSaved })

  function toggleTag(tag: string) {
    setUserTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])
  }

  function addCustomTag() {
    const t = tagInput.trim()
    if (t && !userTags.includes(t)) setUserTags((prev) => [...prev, t])
    setTagInput('')
    setShowCustomInput(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="font-semibold">Editar contato</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form
          onSubmit={handleSubmit((d) => update.mutate({ id: contact.id, ...d, tags: [...userTags, ...listTagsRaw] }))}
          className="space-y-4 p-6"
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium">Nome *</label>
            <input
              {...register('name', { required: 'Nome obrigatório' })}
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name.message as string}</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-muted-foreground">Telefone (somente leitura)</label>
            <input
              value={contact.phone ?? contact.external_id}
              readOnly
              className="w-full rounded-lg border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Empresa</label>
            <input
              {...register('company_name')}
              placeholder="Nome da empresa"
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Endereço</label>
            <input
              {...register('address')}
              placeholder="Rua, cidade..."
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Site</label>
            <input
              {...register('website')}
              placeholder="https://..."
              className="w-full rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium">Tags</label>
              <button
                type="button"
                onClick={() => setShowCustomInput(!showCustomInput)}
                className="text-xs text-primary hover:underline"
              >
                + Personalizada
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_TAGS.map((t) => {
                const active = userTags.includes(t.label)
                return (
                  <button
                    type="button"
                    key={t.label}
                    onClick={() => toggleTag(t.label)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                      active ? t.cls + ' ring-1 ring-offset-1 ring-current' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
            {showCustomInput && (
              <div className="mt-2 flex gap-2">
                <input
                  autoFocus
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomTag())}
                  placeholder="Nome da tag personalizada..."
                  className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button type="button" onClick={addCustomTag} className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">+</button>
              </div>
            )}
            {userTags.filter((t) => !PRESET_TAGS.map((p) => p.label).includes(t)).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {userTags.filter((t) => !PRESET_TAGS.map((p) => p.label).includes(t)).map((t) => (
                  <span key={t} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${getTagCls(t)}`}>
                    {t}
                    <button type="button" onClick={() => setUserTags(userTags.filter((x) => x !== t))} className="opacity-60 hover:opacity-100"><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
          {update.error && (
            <p className="text-xs text-red-500">{update.error.message}</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={update.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Salvar
            </button>
          </div>
        </form>
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
  const [userTags, setUserTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const [listId, setListId] = useState<string>(defaultListId ?? '')
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(addSchema) })
  const create = trpc.contacts.create.useMutation({ onSuccess: onSaved })

  function toggleTag(tag: string) {
    setUserTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])
  }

  function addCustomTag() {
    const t = tagInput.trim()
    if (t && !userTags.includes(t)) setUserTags((prev) => [...prev, t])
    setTagInput('')
    setShowCustomInput(false)
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
          onSubmit={handleSubmit((d) => create.mutate({ name: d.name, phone: d.phone, tags: userTags, listId: listId || undefined }))}
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
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium">Tags</label>
              <button type="button" onClick={() => setShowCustomInput(!showCustomInput)} className="text-xs text-primary hover:underline">
                + Personalizada
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_TAGS.map((t) => {
                const active = userTags.includes(t.label)
                return (
                  <button
                    type="button"
                    key={t.label}
                    onClick={() => toggleTag(t.label)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                      active ? t.cls + ' ring-1 ring-offset-1 ring-current' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
            {showCustomInput && (
              <div className="mt-2 flex gap-2">
                <input
                  autoFocus
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomTag())}
                  placeholder="Nome da tag personalizada..."
                  className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button type="button" onClick={addCustomTag} className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">+</button>
              </div>
            )}
            {userTags.filter((t) => !PRESET_TAGS.map((p) => p.label).includes(t)).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {userTags.filter((t) => !PRESET_TAGS.map((p) => p.label).includes(t)).map((t) => (
                  <span key={t} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${getTagCls(t)}`}>
                    {t}
                    <button type="button" onClick={() => setUserTags(userTags.filter((x) => x !== t))} className="opacity-60 hover:opacity-100"><X className="h-3 w-3" /></button>
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
  const [importTags, setImportTags] = useState<string[]>([])
  const [importTagInput, setImportTagInput] = useState('')
  const [showImportCustomInput, setShowImportCustomInput] = useState(false)
  const [result, setResult] = useState<{ inserted: number; skipped: number; fileDuplicates?: number; total: number } | null>(null)
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

  function toggleImportTag(tag: string) {
    setImportTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])
  }

  function addImportCustomTag() {
    const t = importTagInput.trim()
    if (t && !importTags.includes(t)) setImportTags((prev) => [...prev, t])
    setImportTagInput('')
    setShowImportCustomInput(false)
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
    importBulk.mutate({ contacts: parsed, tags: importTags, listId })
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
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-sm font-medium">Tags para todos os contatos</label>
                  <button type="button" onClick={() => setShowImportCustomInput(!showImportCustomInput)} className="text-xs text-primary hover:underline">
                    + Personalizada
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_TAGS.map((t) => {
                    const active = importTags.includes(t.label)
                    return (
                      <button
                        type="button"
                        key={t.label}
                        onClick={() => toggleImportTag(t.label)}
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
                          active ? t.cls + ' ring-1 ring-offset-1 ring-current' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {t.label}
                      </button>
                    )
                  })}
                </div>
                {showImportCustomInput && (
                  <div className="mt-2 flex gap-2">
                    <input
                      autoFocus
                      value={importTagInput}
                      onChange={(e) => setImportTagInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addImportCustomTag())}
                      placeholder="Nome da tag personalizada..."
                      className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <button type="button" onClick={addImportCustomTag} className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">+</button>
                  </div>
                )}
                {importTags.filter((t) => !PRESET_TAGS.map((p) => p.label).includes(t)).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {importTags.filter((t) => !PRESET_TAGS.map((p) => p.label).includes(t)).map((t) => (
                      <span key={t} className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${getTagCls(t)}`}>
                        {t}
                        <button type="button" onClick={() => setImportTags(importTags.filter((x) => x !== t))} className="opacity-60 hover:opacity-100"><X className="h-3 w-3" /></button>
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
                    {result.inserted} contatos importados com sucesso
                  </p>
                </div>
              </div>

              {((result.fileDuplicates ?? 0) > 0 || result.skipped > 0) && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-1.5">
                  <p className="text-sm font-semibold text-amber-800">Contatos não importados:</p>
                  {(result.fileDuplicates ?? 0) > 0 && (
                    <p className="text-sm text-amber-700">
                      · <strong>{result.fileDuplicates}</strong> com número de telefone repetido no arquivo (formatos diferentes do mesmo número foram unificados)
                    </p>
                  )}
                  {result.skipped > 0 && (
                    <p className="text-sm text-amber-700">
                      · <strong>{result.skipped}</strong> já existiam na sua base de contatos
                    </p>
                  )}
                </div>
              )}

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

// ─── Google Maps Search Modal ─────────────────────────────────────────────────

type MapsPlace = {
  name: string
  phone: string
  address: string
  website: string
  place_id: string
}

function MapsSearchModal({ lists, defaultListId, onClose, onSaved }: {
  lists: ContactList[]
  defaultListId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [query, setQuery] = useState('')
  const [location, setLocation] = useState('')
  const [maxPages, setMaxPages] = useState(1)
  const [results, setResults] = useState<MapsPlace[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadingPage, setLoadingPage] = useState(0)
  const [error, setError] = useState('')
  const [creditsInfo, setCreditsInfo] = useState<{ balance: number; cost: number } | null>(null)
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null)
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [listId, setListId] = useState<string>(defaultListId ?? '')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState<{ inserted: number; skipped: number } | null>(null)
  const importBulk = trpc.contacts.importBulk.useMutation({
    onSuccess: (data) => { setDone(data); setImporting(false) },
    onError: (e) => { setError(e.message); setImporting(false) },
  })

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

  async function fetchOnePage(token?: string): Promise<{ results: MapsPlace[]; nextToken: string | null; remaining: number | null; ok: boolean; error?: string; creditsInfo?: { balance: number; cost: number } }> {
    const res = await fetch('/api/contacts/maps-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: query.trim(),
        location: location.trim() || undefined,
        pageToken: token ?? undefined,
      }),
    })
    const json = await res.json()
    if (!res.ok) {
      return {
        results: [], nextToken: null, remaining: null, ok: false,
        error: json.error ?? 'Erro na busca',
        creditsInfo: json.code === 'INSUFFICIENT_CREDITS' ? { balance: json.balance, cost: json.cost } : undefined,
      }
    }
    return { results: json.results ?? [], nextToken: json.nextPageToken ?? null, remaining: json.credits_remaining ?? null, ok: true }
  }

  async function fetchPlaces(isLoadMore = false, token?: string) {
    const setter = isLoadMore ? setLoadingMore : setLoading
    setter(true)
    setLoadingPage(1)
    setError('')
    if (!isLoadMore) {
      setCreditsInfo(null)
      setResults([])
      setSelected(new Set())
      setNextPageToken(null)
    }
    try {
      const pagesToFetch = isLoadMore ? 1 : maxPages
      let currentToken = token
      let allNew: MapsPlace[] = []

      for (let page = 1; page <= pagesToFetch; page++) {
        setLoadingPage(page)
        const res = await fetchOnePage(currentToken)
        if (!res.ok) {
          if (res.creditsInfo) setCreditsInfo(res.creditsInfo)
          setError(res.error ?? 'Erro na busca')
          break
        }
        allNew = [...allNew, ...res.results]
        setCreditsRemaining(res.remaining)
        currentToken = res.nextToken ?? undefined
        if (!currentToken) break
        // Small delay between pages to avoid rate limits
        if (page < pagesToFetch) await new Promise(r => setTimeout(r, 500))
      }

      setNextPageToken(currentToken ?? null)
      setResults((prev) => isLoadMore ? [...prev, ...allNew] : allNew)
      setSelected((prev) => {
        const next = isLoadMore ? new Set(prev) : new Set<string>()
        allNew.filter((p) => p.phone).forEach((p) => next.add(p.place_id))
        return next
      })
    } catch (e: any) {
      setError(e.message)
    } finally {
      setter(false)
      setLoadingPage(0)
    }
  }

  function handleSearch() {
    if (!query.trim()) return
    fetchPlaces(false)
  }

  function handleLoadMore() {
    if (!nextPageToken) return
    fetchPlaces(true, nextPageToken)
  }

  function toggleAll() {
    const withPhone = results.filter((r) => r.phone).map((r) => r.place_id)
    if (selected.size === withPhone.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(withPhone))
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleImport() {
    const toImport = results.filter((r) => selected.has(r.place_id) && r.phone)
    if (toImport.length === 0) return
    setImporting(true)
    importBulk.mutate({
      contacts: toImport.map((r) => ({
        name: r.name,
        phone: r.phone,
        company_name: r.name,
        address: r.address,
        website: r.website,
      })),
      tags,
      listId: listId || undefined,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 py-8 px-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="font-semibold flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" /> Buscar leads no Google Maps
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Encontre empresas por segmento e importe como contatos · <span className="font-medium">25 créditos por página (até 100 resultados)</span>
              {creditsRemaining !== null && (
                <span className="ml-1 text-green-600">· Saldo: {creditsRemaining} créditos</span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>

        {done ? (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
              <CheckCircle2 className="h-6 w-6 text-green-500 shrink-0" />
              <div>
                <p className="font-semibold text-green-800">Importação concluída!</p>
                <p className="text-sm text-green-700">{done.inserted} inseridos · {done.skipped} ignorados</p>
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={onSaved} className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90">
                Ver contatos
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 space-y-5">
            {/* Search */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Ex: Tatuadores, Dentistas, Academias..."
                className="rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="Cidade (opcional)"
                className="rounded-lg border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 w-full sm:w-44"
              />
              <button
                onClick={handleSearch}
                disabled={!query.trim() || loading}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Buscar
              </button>
            </div>

            {/* Pages selector */}
            <div className="flex items-center gap-3 rounded-xl border bg-muted/20 px-4 py-3">
              <div className="flex-1">
                <p className="text-xs font-medium text-slate-700">Quantidade de resultados</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  até {maxPages * 20} leads · {maxPages * 25} créditos por busca
                </p>
              </div>
              <select
                value={maxPages}
                onChange={(e) => setMaxPages(Number(e.target.value))}
                className="rounded-lg border bg-white px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-primary/30"
              >
                {[1,2,3,4,5,6,7,8,9,10].map((p) => (
                  <option key={p} value={p}>{p * 20} leads</option>
                ))}
              </select>
            </div>

            {loading && loadingPage > 0 && (
              <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-4 py-2.5 text-sm text-primary">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                Buscando página {loadingPage} de {maxPages}...
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 space-y-1">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />{error}
                </div>
                {creditsInfo && (
                  <p className="pl-6 text-xs text-red-600">
                    Saldo atual: <strong>{creditsInfo.balance} créditos</strong> · Custo: <strong>{creditsInfo.cost} créditos</strong>.
                    Contate o suporte para recarregar.
                  </p>
                )}
              </div>
            )}

            {/* Results */}
            {results.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground uppercase">
                    {results.length} resultado{results.length !== 1 ? 's' : ''} · {selected.size} selecionado{selected.size !== 1 ? 's' : ''}
                  </p>
                  <button onClick={toggleAll} className="text-xs text-primary hover:underline">
                    {selected.size === results.filter(r => r.phone).length ? 'Desmarcar todos' : 'Selecionar com telefone'}
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto rounded-xl border divide-y">
                  {results.map((place) => (
                    <label
                      key={place.place_id}
                      className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors ${!place.phone ? 'opacity-50' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(place.place_id)}
                        onChange={() => toggle(place.place_id)}
                        disabled={!place.phone}
                        className="mt-1 accent-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{place.name}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                          {place.phone && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Phone className="h-2.5 w-2.5" />{place.phone}
                            </span>
                          )}
                          {!place.phone && (
                            <span className="text-xs text-red-400">Sem telefone</span>
                          )}
                          {place.address && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground truncate max-w-xs">
                              <MapPin className="h-2.5 w-2.5 shrink-0" />{place.address}
                            </span>
                          )}
                          {place.website && (
                            <span className="flex items-center gap-1 text-xs text-primary">
                              <Globe className="h-2.5 w-2.5" />{place.website.replace(/^https?:\/\//, '').split('/')[0]}
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>

                {/* Load more */}
                {nextPageToken && (
                  <button
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-2.5 text-sm text-muted-foreground hover:bg-muted/30 hover:text-foreground disabled:opacity-60"
                  >
                    {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    {loadingMore ? 'Buscando...' : 'Carregar mais 20 resultados (10 créditos)'}
                  </button>
                )}
              </div>
            )}

            {results.length > 0 && selected.size > 0 && (
              <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
                <p className="text-sm font-medium">Configurar importação</p>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Adicionar à lista</label>
                  <select
                    value={listId}
                    onChange={(e) => setListId(e.target.value)}
                    className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
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
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Tags</label>
                  <div className="flex gap-2">
                    <input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                      placeholder="Pressione Enter para adicionar"
                      className="flex-1 rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <button type="button" onClick={addTag} className="rounded-lg border bg-white px-3 py-2 text-sm hover:bg-muted">+</button>
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
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm hover:bg-muted">Cancelar</button>
              {selected.size > 0 && (
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-60"
                >
                  {importing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Importar {selected.size} contato{selected.size !== 1 ? 's' : ''}
                </button>
              )}
            </div>
          </div>
        )}
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
