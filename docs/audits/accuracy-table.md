| Case | Analytic | Simulated | Error | Tolerance | Result |
|---|---|---|---|---|---|
| Free fall: time to drop 10 m | 1.427843 s | 1.427843 | 5.9e-6% | 1.0e-4% | ✅ |
| Atwood machine: acceleration | 1.962000 m/s² | 1.962000 | <10⁻¹⁰ % | 1.0e-6% | ✅ |
| Atwood machine: tension | 23.54400 N | 23.54400 | <10⁻¹⁰ % | 1.0e-6% | ✅ |
| Incline + pulley with friction: acceleration | 3.244343 m/s² | 3.244343 | 2.2e-6% | 1.0e-4% | ✅ |
| Incline + pulley with friction: tension | 19.69697 N | 19.69697 | 1.3e-6% | 1.0e-4% | ✅ |
| Block on table + hanging mass | 1.605273 m/s² | 1.605273 | 2.1e-6% | 1.0e-4% | ✅ |
| Block sliding down a rough incline | 3.216021 m/s² | 3.216021 | <10⁻¹⁰ % | 1.0e-6% | ✅ |
| Static friction holds a block (tanθ < μs) | 0.000000 m moved | 0.000000 | 0% | 1.0e-6% | ✅ |
| Sliding to a stop: distance | 5.096840 m | 5.096840 | 4.5e-6% | 1.0e-4% | ✅ |
| Simple harmonic motion: period | 0.9934588 s | 0.9934582 | 6.7e-5% | 0.001% | ✅ |
| Damped oscillator: damped period | 1.150219 s | 1.150218 | 2.6e-5% | 0.001% | ✅ |
| Pendulum at 40°: exact period | 2.533921 s | 2.533921 | 4.5e-6% | 0.001% | ✅ |
| Pendulum at 80°: exact period (elliptic integral) | 2.281886 s | 2.281882 | 1.8e-4% | 0.001% | ✅ |
| Pendulum: string tension at the bottom | 14.40020 N | 14.40020 | 6.7e-6% | 0.001% | ✅ |
| Projectile: horizontal range | 20.86311 m | 20.86312 | 1.1e-5% | 0.001% | ✅ |
| Projectile: maximum height | 7.462259 m | 7.462259 | <10⁻¹⁰ % | 1.0e-6% | ✅ |
| Terminal velocity with quadratic drag | 15.66046 m/s | 15.66026 | 0.0013% | 0.01% | ✅ |
| Elastic collision: final velocity | -0.6666667 m/s | -0.6666667 | <10⁻¹⁰ % | 1.0e-9% | ✅ |
| Energy conservation: pendulum over 20 s | 0.000000 J | 0.000002058289 | 3.5e-5% | 1.0e-4% | ✅ |
| RK4 convergence order | 4.000000 order | 3.999899 | 0.0025% | 5% | ✅ |
| Velocity Verlet convergence order | 2.000000 order | 2.000008 | 4.0e-4% | 5% | ✅ |
| Semi-implicit Euler convergence order | 1.000000 order | 1.001627 | 0.16% | 10% | ✅ |
| RC charging: time constant τ = RC | 1.000000 s | 1.000005 | 5.0e-4% | 0.01% | ✅ |
| RC charging: initial current V/R | 0.005000000 A | 0.005000000 | 0% | 1.0e-6% | ✅ |
| RC discharging: time constant | 1.000000 s | 1.000005 | 5.0e-4% | 0.01% | ✅ |
| RL circuit: time constant τ = L/R | 0.02000000 s | 0.02000081 | 0.0041% | 0.01% | ✅ |
| Series RLC: resonant frequency | 159.1549 Hz | 159.1549 | 3.2e-8% | 1.0e-5% | ✅ |
| Series RLC: damped ringing period | 0.006291054 s | 0.006291061 | 1.1e-4% | 0.01% | ✅ |
| Voltage divider | 3.000000 V | 3.000000 | <10⁻¹⁰ % | 1.0e-9% | ✅ |
| Parallel resistors: equivalent resistance | 54.54545 Ω | 54.54545 | 0% | 1.0e-9% | ✅ |
| Wheatstone bridge: galvanometer current | 0.0007233273 A | 0.0007233273 | <10⁻¹⁰ % | 1.0e-9% | ✅ |
| Snell's law: angle of refraction | 25.37399 ° | 25.37399 | 0% | 1.0e-9% | ✅ |
| Glass slab: lateral displacement | 0.3353628 m | 0.3353628 | <10⁻¹⁰ % | 1.0e-9% | ✅ |
| Critical angle for total internal reflection | 41.81031 ° | 41.81031 | <10⁻¹⁰ % | 1.0e-6% | ✅ |
| Thin lens equation: image distance | 1.000000 m | 1.000000 | <10⁻¹⁰ % | 1.0e-9% | ✅ |
| Thin lens: magnification | -0.6666667 × | -0.6666667 | <10⁻¹⁰ % | 1.0e-9% | ✅ |
| Thin lens: virtual image | -1.333333 m | -1.333333 | <10⁻¹⁰ % | 1.0e-9% | ✅ |
| Concave mirror: focal length R/2 | 1.200000 m | 1.200000 | 8.6e-8% | 1.0e-4% | ✅ |
| Thick lens: lensmaker back focal distance | 0.9655172 m | 0.9654708 | 0.0048% | 0.05% | ✅ |

39/39 passed
