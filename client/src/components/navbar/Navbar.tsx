import { NavLink } from 'react-router-dom';
import './Navbar.scss';
import gearIcon from '../../assets/gear.png';

type NavbarProps = {
  isVisible?: boolean;
};

const Navbar = ({ isVisible = true }: NavbarProps) => {
  return (
    <aside
      className={`nav-wrapper ${isVisible ? 'visible' : 'hidden'}`}
      aria-hidden={!isVisible}
    >
      <div className='nav-body'>
        <nav className='nav-links' aria-label='Main navigation'>
          <NavLink className='nav-item' to='/'>
            Dashboard
          </NavLink>
          <NavLink className='nav-item' to='/config'>
            Configuration
          </NavLink>
          <NavLink className='nav-item' to='/visualizer'>
            Relationship Visualizer
          </NavLink>
          <NavLink className='nav-item' to='/statistics'>
            Agent Statistics
          </NavLink>
        </nav>
        <a href='#' className='settings-wrapper' aria-label='Settings'>
          <img className='gear' src={gearIcon} alt='' aria-hidden='true' />
          <div className='settings'>Settings</div>
        </a>
      </div>
    </aside>
  );
};

export default Navbar;
