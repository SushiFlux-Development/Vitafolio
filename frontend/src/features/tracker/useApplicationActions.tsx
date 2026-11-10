import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { saveBlob } from '../../api/download'
import { applicationsApi, coverLettersApi } from '../../api/endpoints'
import type { Application, ApplicationListItem, CoverLetterListItem } from '../../api/types'
import { useConfirm } from '../../components/ui/ConfirmDialog'
import { useErrorDialog } from '../../components/ui/ErrorDialog'
import { ApplicationDetailsDialog } from './ApplicationDetailsDialog'
import { DossierPreviewDialog } from './DossierPreviewDialog'
import type { DossierTarget } from './DossierPreviewDialog'
import { applicationDetailKey } from './queries'

/**
 * Everything one can do with an application from a board or a list, in one place so that the tracker page and the dashboard behave the
 * same: open the details (loaded first; a failure is told, not swallowed), preview and download the dossier, delete after a question.
 * `dialogs` is what has to be rendered once next to the board: the details dialog (status change, timeline, dossier) and the preview.
 */
export function useApplicationActions() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const showError = useErrorDialog()

  const [selectedAppId, setSelectedAppId] = useState<string | null>(null)
  const [previewTarget, setPreviewTarget] = useState<DossierTarget | null>(null)

  const coverLetters = useQuery({ queryKey: ['coverLetters'], queryFn: coverLettersApi.list })
  const active = useQuery({
    queryKey: applicationDetailKey(selectedAppId),
    queryFn: () => applicationsApi.get(selectedAppId ?? ''),
    enabled: Boolean(selectedAppId),
  })

  /** Loads the application first and opens the details only once it is there; a failure is told instead of leaving the click without effect. */
  const openDetails = async (id: string) => {
    try {
      await queryClient.fetchQuery({ queryKey: applicationDetailKey(id), queryFn: () => applicationsApi.get(id), staleTime: 0 })
      setSelectedAppId(id)
    } catch (error) {
      showError(error, t('applications.errors.load'))
    }
  }

  const remove = useMutation({
    mutationFn: (id: string) => applicationsApi.delete(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['applications'] })
      setSelectedAppId(null)
    },
    onError: (error) => showError(error, t('applications.errors.delete')),
  })

  const download = async (id: string) => {
    try {
      const { blob, filename } = await applicationsApi.downloadDossier(id)
      saveBlob(blob, filename)
    } catch (error) {
      showError(error, t('applications.errors.download'))
    }
  }

  const askDelete = async (application: Pick<Application, 'id' | 'company' | 'jobTitle'>) => {
    const ok = await confirm({
      title: t('applications.actions.delete'),
      message: t('applications.deleteConfirm', { company: application.company, jobTitle: application.jobTitle }),
      confirmLabel: t('applications.actions.delete'),
      tone: 'danger',
    })
    if (ok) remove.mutate(application.id)
  }

  const preview = (application: Pick<Application, 'id' | 'company' | 'jobTitle'>) =>
    setPreviewTarget({ id: application.id, company: application.company, jobTitle: application.jobTitle })

  const detail = selectedAppId ? active.data : undefined
  const letters: readonly Pick<CoverLetterListItem, 'id' | 'title'>[] = coverLetters.data ?? []

  const dialogs = (
    <>
      {detail && (
        <ApplicationDetailsDialog
          key={detail.id}
          app={detail}
          onClose={() => setSelectedAppId(null)}
          coverLetters={letters}
          onDelete={() => void askDelete(detail)}
          onDownload={() => void download(detail.id)}
          onPreview={() => preview(detail)}
        />
      )}
      <DossierPreviewDialog target={previewTarget} onClose={() => setPreviewTarget(null)} onDownload={(target) => void download(target.id)} />
    </>
  )

  return {
    dialogs,
    coverLetters: letters,
    openDetails,
    /** Shows the details of an application that is loaded already (just created, say). */
    showDetails: setSelectedAppId,
    /** What a board or list needs for its cards. */
    boardProps: {
      onSelect: (id: string) => void openDetails(id),
      onPreview: (application: ApplicationListItem) => preview(application),
      onDownload: (application: ApplicationListItem) => void download(application.id),
    },
    download,
    askDelete,
  }
}
