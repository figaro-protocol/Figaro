# Figaro Protocol — The Simple Version

---

## The Problem Everyone Has

You want to buy something from a stranger on the internet. Maybe it's food. Maybe it's a service. Maybe it's something shipped from another country. The problem is: you don't trust them, and they don't trust you.

Right now, the way we usually solve this is by packaging the deal inside a big company. Uber, DoorDash, Amazon give you a familiar shell for exchange: they hold the money, decide what counts as a problem, take a huge cut, and make both sides operate on their terms.

Figaro starts from the deal itself. Instead of a standing company coordinating every exchange, each exchange can assemble its own temporary institution out of the people actually doing the work.

---

## How It Works (The Pinky Promise With Real Money)

Imagine you want to buy something for $10. Here's what happens:

1. **You (the buyer) put $20 into a lockbox.** That's the $10 you're paying, plus $10 extra as your guarantee that you won't mess around.
2. **The seller also puts $20 into the lockbox.** That's their guarantee that they'll actually deliver what they promised.
3. **Now there's $40 locked up, and neither of you can touch it.**

If the deal goes through — you get your thing, the seller did their job — the lockbox opens. You get your $10 guarantee back. The seller gets their $20 guarantee back plus the $10 payment. Everyone's happy.

If either of you tries to cheat? **Both of you lose everything in the lockbox.** The cheater loses money, but so does the victim. That sounds harsh, but it's the whole point: cheating always costs you more than just playing fair. So nobody cheats.

It's like mutually assured destruction, but for online shopping.

**Why 2x and not some other number?** If the seller only put up 1x ($10), they could cheat and break even — they lose their deposit but keep whatever they stole, so it's a wash. At 2x, cheating always means a net loss. 3x would work too, but it's just wasting extra money for no additional benefit.

---

## There Are No Companies — Only People Doing Work

Here's where it gets interesting. Think about ordering a burger.

In the current world, you think you're buying from "Joe's Burger Joint." But that's not what's really happening. There's a cook making the burger. Someone else sourced the ingredients. Someone else owns the kitchen. A driver picks it up and delivers it. And a company like DoorDash is sitting on top of all of them, taking a fee for connecting everybody.

In Figaro, "Joe's Burger Joint" doesn't exist as one thing. Instead, there's a **tree** of individual people, each doing their part:

```
You (buyer)
 └─ Cook (makes the burger, bonds $X)
     ├─ Ingredient person (got the tomatoes, bonds $Y)
     └─ Kitchen operator (provides the space, bonds $Z)
 └─ Driver (delivers it, bonds $W)
```

Each person locks up their own money as a guarantee. Each person gets paid directly for the value they actually added. Everyone coordinates directly — the architecture makes intermediaries structurally unnecessary.

That tree is the institution for that specific order. It forms for the deal, coordinates the work, and dissolves when settlement happens.

And here's the kicker: **if any one person in that tree screws up, the whole tree fails and everyone loses their deposits.** So every person in the tree is motivated to make sure every *other* person does their job. It's like a group project at school — except instead of one person slacking off while everyone else does the work, everyone has real money on the line. Slacking off costs you cash.

---

## It Works For Everything, Not Just Food

The same system works for literally any deal between people:

- **Rides**: You need to get somewhere. A driver bonds money, picks you up, gets paid.
- **Repairs**: Your sink is broken. A plumber bonds money, fixes it, gets paid.
- **Buying stuff from another country**: A seller ships something, a logistics company moves it, customs processes it — each one is a node in the tree, each one has money locked up.
- **Freelance work**: Someone builds you a website. They bond money, deliver the work, get paid.

The pattern is always the same: lock money, do the work, get paid. No leap of faith needed. No standing intermediary has to hold the relationship together.

---

## What Everyone Can See (And What They Can't)

Everything about the deal — how much money is locked, who's involved, whether it got completed — is visible to everyone on the blockchain. On purpose.

Think of it like a public bulletin board. Anyone can see "there's a $10 delivery needed in downtown Austin" or "there are 50 orders happening in this neighborhood right now." Drivers (or AI bots) can look at the board and decide where to go to find work. That's way more efficient than a company's algorithm deciding for them.

**But** your home address, your personal details, your private notes — all of that is encrypted. Only the people involved in your specific order can see it. One order gets hacked? The next order's info is still safe, because every order has its own separate encryption key. There's no master database to steal.

---

## Who's In Charge?

Nobody. That's the point.

There's no company running Figaro. There's no CEO. There's no customer support line. There's no one who can freeze your account or ban you from the platform.

"But what if something goes wrong?"

Three things protect you, in order:

1. **The money.** Cheating costs the cheater more than cooperating. This handles 99% of situations. People don't burn their own money for fun.

2. **Peer pressure (with teeth).** In a group deal, everyone loses if one person screws up. So everyone watches everyone else. It's like how study groups work better when everyone's grade depends on the group score.

3. **Receipts.** Every single thing that happens is permanently recorded on the blockchain with a timestamp. If someone is truly irrational and cheats despite losing money, you have unforgeable proof you can take to a court, arbitrator, or wherever. The evidence is already collected before the dispute even starts.

---

## Why Does This Matter?

Right now, if you want to sell something — food, rides, services, goods — you probably need to go through a platform. That platform:
- Takes 15-30% of your revenue
- Can ban you at any time
- Controls your customer relationships
- Decides the rules you play by
- Might not even operate in your country

Figaro replaces all of that with math. Two times your money, locked in a smart contract, released when the job's done. It works the same whether you're in New York, Nairobi, or anywhere else with an internet connection. It works the same whether you're a person or an AI agent.

No permission needed. No application to fill out. No terms of service to accept. Just: put up your bond, do the work, get paid.

**That's Figaro.** A world where you don't need to trust anyone — you just need to show you have skin in the game.
