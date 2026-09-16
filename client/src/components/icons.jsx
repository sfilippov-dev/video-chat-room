/**
 * Набор иконок интерфейса.
 *
 * Иконки нарисованы инлайновым SVG и не тянут за собой шрифт или библиотеку:
 * их здесь полтора десятка, и любая зависимость ради них обошлась бы дороже
 * самих путей. Цвет и толщина линии не задаются в разметке — глифы наследуют
 * currentColor и stroke-width от класса, который передаёт вызывающий
 * компонент. Одна и та же иконка поэтому работает и на панели управления, и в
 * сообщении об ошибке.
 *
 * Все иконки декоративны и помечены aria-hidden: смысл несёт подпись рядом или
 * aria-label кнопки. Исключение — MutedMicIcon на плитке участника: там
 * иконка и есть единственный носитель факта «микрофон выключен», поэтому у неё
 * своя доступная подпись.
 */

const BOX = { viewBox: '0 0 24 24', 'aria-hidden': true };

/**
 * Перечёркивание у выключенного устройства.
 *
 * Вынесено отдельной функцией, потому что линия одна и та же у микрофона и у
 * камеры, а класс на ней несёт поведение: штрих прорисовывается по длине, а не
 * возникает готовым. pathLength="1" переводит длину пути в единицу, и стилю не
 * нужно знать настоящую — иконку можно перерисовать, не трогая CSS.
 */
function Slash() {
  return <path className="icon-glyph__slash" pathLength="1" d="M4 4l16 16" />;
}

export function MicIcon({ className }) {
  return (
    <svg {...BOX} className={className}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

export function MicOffIcon({ className }) {
  return (
    <svg {...BOX} className={className}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
      <Slash />
    </svg>
  );
}

export function CameraIcon({ className }) {
  return (
    <svg {...BOX} className={className}>
      <rect x="3" y="6" width="12" height="12" rx="2.5" />
      <path d="M15 10.5 21 7v10l-6-3.5z" />
    </svg>
  );
}

export function CameraOffIcon({ className }) {
  return (
    <svg {...BOX} className={className}>
      <rect x="3" y="6" width="12" height="12" rx="2.5" />
      <path d="M15 10.5 21 7v10l-6-3.5z" />
      <Slash />
    </svg>
  );
}

export function LinkIcon({ className }) {
  return (
    <svg {...BOX} className={className}>
      <path d="M10.5 13.5a4 4 0 0 0 5.66 0l2.5-2.5a4 4 0 1 0-5.66-5.66l-1.4 1.4" />
      <path d="M13.5 10.5a4 4 0 0 0-5.66 0l-2.5 2.5a4 4 0 1 0 5.66 5.66l1.4-1.4" />
    </svg>
  );
}

/**
 * Трубка, положенная на рычаг: «завершить звонок».
 *
 * Глиф построен из дуг с посчитанными радиусами, а не набросан от руки, и
 * потому строго симметричен относительно вертикали x=12 — прежний вариант
 * заваливался вбок именно из-за подобранных на глаз координат.
 *
 * Внешняя дуга (радиус 10.36, центр 12;18.31) — спинка трубки, внутренняя
 * (радиус 15.71, центр 12;26.26) — её нижний край; разная кривизна и даёт
 * узнаваемое утолщение к концам. Скосы под 45° замыкают торцы, короткие
 * скругления снимают остроту с нижних углов.
 *
 * По вертикали глиф занимает 7.95…16.0 — центр ровно на 12, как и по
 * горизонтали. Это важнее математического центра фигуры: в круглой кнопке
 * глаз ловит именно смещение оптического центра, а у дугообразной фигуры
 * масса собрана снизу.
 */
export function HangUpIcon({ className }) {
  return (
    <svg {...BOX} className={className}>
      <path
        d="M12 7.95
           A 10.36 10.36 0 0 0 2.6 13.95
           L 4.4 15.75
           A 0.85 0.85 0 0 0 5.6 15.75
           C 6.2 15.25 6.9 14.75 7.7 14.35
           V 11.15
           A 15.71 15.71 0 0 1 16.3 11.15
           V 14.35
           C 17.1 14.75 17.8 15.25 18.4 15.75
           A 0.85 0.85 0 0 0 19.6 15.75
           L 21.4 13.95
           A 10.36 10.36 0 0 0 12 7.95
           Z"
      />
    </svg>
  );
}

export function SendIcon({ className }) {
  return (
    <svg {...BOX} className={className}>
      <path d="M20.5 3.5 11 13" />
      <path d="M20.5 3.5 14.4 20.5l-3.4-7.5-7.5-3.4z" />
    </svg>
  );
}

/** Восклицательный знак в круге: одна иконка и на отказ, и на предупреждение. */
export function AlertIcon({ className }) {
  return (
    <svg {...BOX} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5" />
      <path d="M12 16.2h.01" />
    </svg>
  );
}

/**
 * Перечёркнутый микрофон на плитке участника.
 *
 * Здесь иконка не декоративна: она единственная сообщает, что собеседника не
 * слышно, поэтому у неё role и подпись, а не aria-hidden. Заливка вместо
 * обводки — чтобы глиф оставался различимым в 16 пикселей поверх видео.
 */
export function MutedMicIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label="Микрофон выключен">
      <path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3 3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z" />
      <path d="M5 11a7 7 0 0 0 14 0" fill="none" strokeWidth="2" stroke="currentColor" />
      <path d="M12 18v3" fill="none" strokeWidth="2" stroke="currentColor" />
      <path
        className="icon-glyph__slash"
        pathLength="1"
        d="M3 3l18 18"
        fill="none"
        strokeWidth="2.5"
        stroke="currentColor"
      />
    </svg>
  );
}

/** Силуэт человека для заглушки при выключенной камере. */
export function SilhouetteIcon({ className }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <circle cx="32" cy="23" r="12" />
      <path d="M8 60c0-13 11-20 24-20s24 7 24 20z" />
    </svg>
  );
}
