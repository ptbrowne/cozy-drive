import styles from '../styles/confirms'
import classNames from 'classnames'

import React from 'react'
import Modal from 'cozy-ui/react/Modal'

const DeleteConfirm = ({ t, fileCount, confirm, abort }) => {
  const deleteConfirmationTexts = ['trash', 'restore', 'shared'].map(type => (
    <p className={classNames(styles['fil-confirm-text'], styles[`icon-${type}`])}>
      {t(`deleteconfirmation.${type}`, fileCount)}
    </p>
  ))

  return (<Modal
    title={t('deleteconfirmation.title', fileCount)}
    description={deleteConfirmationTexts}
    secondaryText={t('deleteconfirmation.cancel')}
    secondaryAction={abort}
    primaryType='danger'
    primaryText={t('deleteconfirmation.delete')}
    primaryAction={confirm}
   />)
}

export default DeleteConfirm
