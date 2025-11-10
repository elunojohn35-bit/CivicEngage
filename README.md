# 🏛️ CivicEngage: NFT Badges for Policy Participation

Welcome to CivicEngage, a Web3 platform on the Stacks blockchain that boosts civic participation! Creators and citizens earn NFT badges for engaging in community activities, unlocking access to exclusive policy discussion forums. Say goodbye to low voter turnout and echo chambers—empower real dialogue with blockchain-verified contributions.

## ✨ Features
🎖️ Mint customizable NFT badges for actions like voting, proposing policies, or forum posts  
📈 Track engagement levels to upgrade badges automatically  
🔑 Gated access to tiered policy forums based on badge rarity  
🗳️ Secure on-chain voting for community proposals  
💬 Integrated forum management with role-based permissions  
📊 Transparent analytics for participation metrics  
🔒 Sybil-resistant via proof-of-engagement  
🏆 Reward pools for top contributors  

## 🛠 How It Works
**Powered by Clarity Smart Contracts**  
This project uses 8 Clarity smart contracts on the Stacks blockchain for secure, immutable civic tools:  
- **BadgeMinter**: Mints soulbound NFTs as engagement badges.  
- **EngagementTracker**: Logs and verifies user actions (e.g., votes, posts).  
- **BadgeUpgrader**: Handles badge rarity upgrades based on cumulative engagement.  
- **AccessGate**: Controls forum entry using badge ownership and levels.  
- **ForumManager**: Creates and moderates discussion spaces.  
- **ProposalVault**: Stores and timestamps policy proposals.  
- **VotingHub**: Facilitates quadratic voting on proposals.  
- **RewardPool**: Distributes STX incentives to high-engagement users.  

**For Citizens & Activists**  
- Complete civic actions (e.g., vote in a local election simulation or post in a public forum).  
- Call `track-engagement` on EngagementTracker with proof (e.g., off-chain signature).  
- Mint your first badge via BadgeMinter—boom, you're in the Bronze Forum!  
- Rack up points to upgrade to Silver/Gold badges for elite discussions.  

**For Forum Moderators & Orgs**  
- Deploy a new forum with ForumManager and set access tiers.  
- Use AccessGate to verify entrants: `check-access? { user: tx-sender, forum-id: 1, required-level: "silver" }`.  
- Review proposals in ProposalVault and trigger votes.  
- Distribute rewards: `claim-rewards` pulls from the pool based on verified contributions.  

**Real-World Impact**  
Tackles declining civic engagement (e.g., only 66% U.S. voter turnout in 2020) by gamifying participation. Badges prove skin-in-the-game, fostering inclusive policy debates without centralized gatekeepers. Deploy on Stacks for low fees and Bitcoin finality!

## 🚀 Getting Started
1. Clone the repo and set up your Stacks dev environment.  
2. Deploy contracts using Clarinet: `clarinet deploy`.  
3. Interact via Hiro Wallet or the Stacks API.  
4. Test with sample engagements—earn your first badge today!  

## 📄 License  
MIT License—fork, build, and civic-hack away!  
