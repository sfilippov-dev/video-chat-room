import { AlertIcon } from './icons.jsx';

/**
 * Сообщение о состоянии или сбое.
 *
 * Любой отказ в приложении заканчивается объяснением и понятным следующим
 * шагом, а не белым экраном: пользователь должен знать, почему он не в звонке
 * и что с этим делать.
 */
export default function Notice({ tone = 'error', text, actionLabel, onAction }) {
  return (
    <div className={`notice notice--${tone}`} role="alert">
      <AlertIcon className="notice__icon" />

      <div className="notice__body">
        <p className="notice__text">{text}</p>

        {actionLabel ? (
          <p className="notice__actions">
            <button className="button button--primary" type="button" onClick={onAction}>
              {actionLabel}
            </button>
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** Полноэкранный вариант: сессии нет, показывать поверх нечего. */
export function NoticeScreen({ title, ...props }) {
  return (
    <main className="shell shell--narrow">
      <h1 className="title">{title}</h1>
      <Notice {...props} />
    </main>
  );
}
