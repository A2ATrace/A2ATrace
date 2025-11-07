import { NavLink } from 'react-router-dom';
import './navbar.scss';
import gearIcon from '../../assets/gear.png';

const Navbar = () => {
  return (
    <aside className='nav-wrapper'>
      <div className='nav-body'>
        <nav className='nav-links'>
          <NavLink className='nav-item' to='/'>
            Dashboard
          </NavLink>
          <NavLink className='nav-item' to='/visualizer'>
            Relationship Visualizer
          </NavLink>
          <NavLink className='nav-item' to='/statistics'>
            Agent Statistics
          </NavLink>
        </nav>
        <button
          className='settings-wrapper'
          onClick={() => {
            // Settings functionality to be implemented
          }}
          type='button'
          aria-label='Settings'
        >
          <img className='gear' src={gearIcon} alt='settings gear' />
          <div className='settings'>Settings</div>
        </button>
      </div>
    </aside>
  );
};

export default Navbar;
