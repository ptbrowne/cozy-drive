/* global cozy */
import { saveFileWithCordova, openFileWithCordova } from '../../mobile/src/lib/filesystem'
import { openWithNoAppError } from '../../mobile/src/actions'

import { ROOT_DIR_ID, TRASH_DIR_ID } from '../constants/config.js'

export const LOCATION_CHANGE = 'LOCATION_CHANGE'
export const OPEN_FOLDER = 'OPEN_FOLDER'
export const OPEN_FOLDER_SUCCESS = 'OPEN_FOLDER_SUCCESS'
export const OPEN_FOLDER_FAILURE = 'OPEN_FOLDER_FAILURE'
export const ABORT_ADD_FOLDER = 'ABORT_ADD_FOLDER'
export const CREATE_FOLDER = 'CREATE_FOLDER'
export const CREATE_FOLDER_FAILURE_GENERIC = 'CREATE_FOLDER_FAILURE_GENERIC'
export const CREATE_FOLDER_FAILURE_DUPLICATE = 'CREATE_FOLDER_FAILURE_DUPLICATE'
export const CREATE_FOLDER_SUCCESS = 'CREATE_FOLDER_SUCCESS'
export const UPLOAD_FILE = 'UPLOAD_FILE'
export const UPLOAD_FILE_SUCCESS = 'UPLOAD_FILE_SUCCESS'
export const TRASH_FILES = 'TRASH_FILES'
export const TRASH_FILES_SUCCESS = 'TRASH_FILES_SUCCESS'
export const TRASH_FILES_FAILURE = 'TRASH_FILES_FAILURE'
export const DOWNLOAD_SELECTION = 'DOWNLOAD_SELECTION'
export const DOWNLOAD_FILE = 'DOWNLOAD_FILE'
export const DOWNLOAD_FILE_E_MISSING = 'DOWNLOAD_FILE_E_MISSING'
export const DOWNLOAD_FILE_E_OFFLINE = 'DOWNLOAD_FILE_E_OFFLINE'
export const OPEN_FILE_WITH = 'OPEN_FILE_WITH'
export const OPEN_FILE_E_OFFLINE = 'OPEN_FILE_E_OFFLINE'
export const OPEN_FILE_E_NO_APP = 'OPEN_FILE_E_NO_APP'

const extractFileAttributes = f => Object.assign({}, f.attributes, { id: f._id })
const toServer = f => Object.assign({}, { attributes: f }, { _id: f.id })

export const HTTP_CODE_CONFLICT = 409
const ALERT_LEVEL_ERROR = 'error'

const META_DEFAULTS = {
  cancelSelection: true,
  hideActionMenu: true
}

export const openFiles = () => {
  return async dispatch => dispatch(openFolder(ROOT_DIR_ID))
}

export const openTrash = () => {
  return async dispatch => dispatch(openFolder(TRASH_DIR_ID))
}

export const openFolder = (folderId) => {
  return async (dispatch, getState) => {
    dispatch({
      type: OPEN_FOLDER,
      folderId,
      meta: {
        cancelSelection: true
      }
    })
    try {
      const settings = getState().settings
      const offline = settings.offline && settings.firstReplication
      const folder = await cozy.client.files.statById(folderId, offline)
      const parentId = folder.attributes.dir_id
      const parent = !!parentId && await cozy.client.files.statById(parentId, offline)
      // folder.relations('contents') returns null when the trash is empty
      const files = folder.relations('contents') || []
      return dispatch({
        type: OPEN_FOLDER_SUCCESS,
        folder: Object.assign(extractFileAttributes(folder), {
          parent: extractFileAttributes(parent)
        }),
        files: files.map(c => extractFileAttributes(c))
      })
    } catch (err) {
      return dispatch({ type: OPEN_FOLDER_FAILURE, error: err })
    }
  }
}

export const openFileInNewTab = (folder, file) => {
  return async dispatch => {
    const filePath = await cozy.client.files.getFilePath(file, toServer(folder))
    const href = await cozy.client.files.getDownloadLink(filePath)
    window.open(`${cozy.client._url}${href}`, '_blank')
  }
}

export const uploadFile = (file, folder) => {
  return async dispatch => {
    dispatch({ type: UPLOAD_FILE })
    const created = await cozy.client.files.create(
      file,
      { dirID: folder.id }
    )
    dispatch({
      type: UPLOAD_FILE_SUCCESS,
      file: extractFileAttributes(created)
    })
  }
}

export const abortAddFolder = (accidental) => {
  const action = {
    type: ABORT_ADD_FOLDER,
    accidental
  }
  if (accidental) {
    action.alert = {
      message: 'alert.folder_abort'
    }
  }
  return action
}

export const createFolder = name => {
  return async (dispatch, getState) => {
    const existingFolder = getState().view.files.find(f => f.type === 'directory' && f.name === name)

    if (existingFolder) {
      dispatch({
        type: CREATE_FOLDER_FAILURE_DUPLICATE,
        alert: {
          message: 'alert.folder_name',
          messageData: { folderName: name }
        }
      })
      throw new Error('alert.folder_name')
    }

    dispatch({
      type: CREATE_FOLDER,
      name
    })

    try {
      const folder = await cozy.client.files.createDirectory({
        name: name,
        dirID: getState().view.displayedFolder.id
      })
      dispatch({
        type: CREATE_FOLDER_SUCCESS,
        folder: extractFileAttributes(folder)
      })
    } catch (err) {
      if (err.response && err.response.status === HTTP_CODE_CONFLICT) {
        dispatch({
          type: CREATE_FOLDER_FAILURE_DUPLICATE,
          alert: {
            message: 'alert.folder_name',
            messageData: { folderName: name }
          }
        })
      } else {
        dispatch({
          type: CREATE_FOLDER_FAILURE_GENERIC,
          alert: {
            message: 'alert.folder_generic'
          }
        })
      }
      throw err
    }
  }
}

export const trashFiles = files => {
  const meta = META_DEFAULTS
  return async dispatch => {
    dispatch({ type: TRASH_FILES, files, meta })
    const trashed = []
    try {
      for (const file of files) {
        trashed.push(await cozy.client.files.trashById(file.id))
      }
    } catch (err) {
      return dispatch({
        type: TRASH_FILES_FAILURE,
        alert: {
          message: 'alert.try_again'
        }
      })
    }
    return dispatch({
      type: TRASH_FILES_SUCCESS,
      ids: files.map(f => f.id),
      alert: {
        message: 'alert.trash_file_success'
      }
    })
  }
}

export const downloadSelection = selected => {
  const meta = META_DEFAULTS
  return async (dispatch) => {
    if (selected.length === 1 && selected[0].type !== 'directory') {
      return dispatch(downloadFile(selected[0], meta))
    }
    const paths = selected.map(f => f.path)
    const href = await cozy.client.files.getArchiveLink(paths)
    const fullpath = await cozy.client.fullpath(href)
    forceFileDownload(fullpath, 'files.zip')
    return dispatch({ type: DOWNLOAD_SELECTION, selected, meta })
  }
}

const isMissingFile = (error) => error.status === 404

const downloadFileError = (error, meta) => {
  const message = isMissingFile(error) ? 'error.download_file.missing' : 'error.download_file.offline'
  const type = isMissingFile(error) ? DOWNLOAD_FILE_E_MISSING : DOWNLOAD_FILE_E_OFFLINE
  return { type, alert: { message, level: ALERT_LEVEL_ERROR }, meta }
}

const downloadFile = (file, meta) => {
  return async (dispatch) => {
    const response = await cozy.client.files.downloadById(file.id).catch((error) => {
      dispatch(downloadFileError(error, meta))
      throw error
    })
    const blob = await response.blob()
    const filename = file.name

    if (window.cordova && window.cordova.file) {
      saveFileWithCordova(blob, filename)
    } else {
      forceFileDownload(window.URL.createObjectURL(blob), filename)
    }
    return dispatch({ type: DOWNLOAD_FILE, file, meta })
  }
}

const forceFileDownload = (href, filename) => {
  const element = document.createElement('a')
  element.setAttribute('href', href)
  element.setAttribute('download', filename)
  element.style.display = 'none'
  document.body.appendChild(element)
  element.click()
  document.body.removeChild(element)
}

export const openFileWith = (id, filename) => {
  const meta = {
    cancelSelection: true,
    hideActionMenu: true
  }
  return async (dispatch, getState) => {
    if (window.cordova && window.cordova.plugins.fileOpener2) {
      dispatch({ type: OPEN_FILE_WITH, id, meta })
      const response = await cozy.client.files.downloadById(id).catch((error) => {
        console.error('downloadById', error)
        dispatch(downloadFileError(error, meta))
        throw error
      })
      const blob = await response.blob()
      openFileWithCordova(blob, filename).catch((error) => {
        console.error('openFileWithCordova', error)
        dispatch(openWithNoAppError(meta))
      })
    } else {
      dispatch(openWithNoAppError(meta))
    }
  }
}
