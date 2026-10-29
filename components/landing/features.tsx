const BENEFITS = [
  {
    title: "Choose the model for the job.",
    body: "Compare across model families and switch models through a consistent API.",
  },
  {
    title: "Understand the price up front.",
    body: "Separate input and output rates make the cost basis clear before you send a request.",
  },
  {
    title: "Keep sight of your usage.",
    body: "Manage project keys and review recorded requests and charges from your account.",
  },
];

export function Features() {
  return (
    <section className="value-surface" id="value">
      <div className="landing-section mx-auto grid w-full max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-24 lg:px-8">
        <div>
          <p className="section-kicker">02 / A better way to choose</p>
          <h2 className="mt-5">
            Spend on the work.
            <br />
            <span className="text-accent">See what it takes.</span>
          </h2>
          <p className="mt-6 max-w-lg text-xl leading-8 text-muted">
            Model choice is a balance of capability and cost. Savant puts the
            options and the numbers in one place, so you can make that call.
          </p>
        </div>
        <div>
          {BENEFITS.map((benefit, index) => (
            <article key={benefit.title} className="value-row">
              <span>/ 0{index + 1}</span>
              <div>
                <h3>{benefit.title}</h3>
                <p>{benefit.body}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
