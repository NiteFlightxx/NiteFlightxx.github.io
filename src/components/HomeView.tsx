import HomeHyperspeed from './backgrounds/HomeHyperspeed';

export default function HomeView() {
  return (
    <div className="studio-shell home-landing" id="home-view-container">
      <section className="home-landing-copy" aria-labelledby="studio-title">
        <span className="home-landing-eyebrow">STAY CURIOUS</span>
        <h1 id="studio-title">保持好奇</h1>
      </section>
      <HomeHyperspeed />
    </div>
  );
}
