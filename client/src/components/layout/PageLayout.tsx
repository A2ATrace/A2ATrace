import { useState } from 'react';
import type { PropsWithChildren } from 'react';
// Reuse dashboard shell styles
import '../../pages/dashboard/Dashboard.scss';
import Navbar from '../navbar/Navbar';
import TitleNav from '../titlenav/TitleNav';

type PageLayoutProps = PropsWithChildren<{}>;

const PageLayout = ({ children }: PageLayoutProps) => {
  const [navbarVisible, setNavbarVisible] = useState(true);

  const toggleNavbar = () => setNavbarVisible((prev) => !prev);

  return (
    <div className='dashboard-page'>
      <TitleNav onToggleNav={toggleNavbar} />
      <Navbar isVisible={navbarVisible} />
      <section
        className={`dashboard-body-wrapper ${
          navbarVisible ? '' : 'nav-hidden'
        }`}
      >
        {children}
      </section>
    </div>
  );
};

export default PageLayout;
