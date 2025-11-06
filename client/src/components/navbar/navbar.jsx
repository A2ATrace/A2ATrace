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
        <a href='#' className='settings-wrapper'>
          <img className='gear' src={gearIcon} alt='settings gear'></img>
          <div className='settings'>Settings</div>
        </a>
      </div>
    </aside>
  );
};

export default Navbar;
