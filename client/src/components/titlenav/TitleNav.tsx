import './TitleNav.scss';

type TitleNavProps = {
  onToggleNav?: () => void;
};

const TitleNav = ({ onToggleNav }: TitleNavProps) => {
  return (
    <aside className='titlenav-wrapper'>
      <span className='titlenav-title'>A2A Trace</span>
      <div className='titlenav-body'>
        {onToggleNav && (
          <button
            className='nav-toggle-btn'
            onClick={onToggleNav}
            aria-label='Toggle navigation menu'
            aria-expanded='true'
            type='button'
          >
            <span className='hamburger-icon' aria-hidden='true'>
              ☰
            </span>
          </button>
        )}
      </div>
    </aside>
  );
};

export default TitleNav;
