import { UPLOAD } from '../../../app/config'
import type { PostDraft } from '../service'
import type { User } from '../../../shared/types'
import { BackCircleIcon, CloudUploadIcon, UploadTrayIcon } from './icons'
import PostForm, { Errors, type Placement } from './PostForm'
import { useDrop, usePhotoPicker } from './usePhotoPicker'

type Props = {
  friends: User[]
  placement: Placement
  onBack: () => void
  onPost: (draft: PostDraft) => Promise<void>
}

const MB = 1024 * 1024

// Two steps, as in the designs: "Upload Image" (choose files), then "Post" (tag people, name the
// album, set the location). Choosing files moves straight on; Back, or removing every photo, returns.
export default function UploadPost({ friends, placement, onBack, onPost }: Props) {
  const picker = usePhotoPicker()

  const gpsFrom = picker.picked.find((p) => p.meta?.gps)
  const takenAt = picker.picked.map((p) => p.meta?.takenAt).filter(Boolean).sort()[0]

  if (picker.picked.length === 0) {
    return (
      <div className="cap-view upload">
        <input {...picker.inputProps} />
        <div className="upload-head">
          <span className="upload-badge">
            <CloudUploadIcon size={32} />
          </span>
          <div>
            <h2>
              Upload Image <small>- Post</small>
            </h2>
            <p>Select and upload the files of your choice</p>
          </div>
        </div>
        <DropZone onFiles={picker.add} onBrowse={picker.browse} errors={picker.errors} />
        <div className="cap-foot">
          <button type="button" className="cap-btn has-icon" onClick={onBack}>
            <BackCircleIcon /> Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <input {...picker.inputProps} />
      <PostForm
        head={{
          icon: <UploadTrayIcon />,
          title: (
            <>
              <small>Upload Image -</small> Post
            </>
          ),
          subtitle: 'Tagged people can view your Image/album',
        }}
        photos={picker.picked.map((p) => ({ id: p.id, url: p.url, name: p.file.name, fromGps: p === gpsFrom }))}
        onRemovePhoto={picker.remove}
        onAddFiles={picker.add}
        onBrowse={picker.browse}
        errors={picker.errors}
        friends={friends}
        placement={placement}
        gps={gpsFrom?.meta?.gps}
        submitLabel="Post"
        onSubmit={({ title, taggedIds, place }) =>
          onPost({ files: picker.picked.map((p) => p.file), place, title: title || undefined, taggedIds, capturedAt: takenAt })
        }
        onBack={picker.clear}
      />
    </>
  )
}

function DropZone({ onFiles, onBrowse, errors }: { onFiles: (f: FileList) => void; onBrowse: () => void; errors: string[] }) {
  const drop = useDrop(onFiles)
  return (
    <div className={`dropzone${drop.over ? ' is-over' : ''}`} {...drop.props}>
      <svg className="dropzone-border" aria-hidden="true">
        <rect x="1" y="1" rx="22" ry="22" />
      </svg>
      <CloudUploadIcon size={34} />
      <p className="dz-title">Choose a file or drag &amp; drop it here</p>
      <p className="dz-hint">JPEG, PNG, HEIC / HEIF up to {UPLOAD.maxBytes / MB} MB</p>
      <button type="button" className="dz-browse" onClick={onBrowse}>
        Browse File
      </button>
      {errors.length > 0 && <Errors list={errors} />}
    </div>
  )
}
