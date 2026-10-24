# TasteWeave | Qloo Agentic Hackathon

Name: TasteWeave, a taste graph planner with an explainable agent

Description:
TasteWeave turns a taste profile into a planned afternoon. Rate attributes across music, film, food, books, and places, and a transparent similarity engine explains every match it surfaces, attribute by attribute, so nothing is a black box.

The agentic planner is the centerpiece. Give it a budget and a mood, and it assembles a complete culture session, something to listen to, watch, cook, and read, while a seven phase agent log narrates each decision: read profile, weigh mood, split the budget, search, select, review, finish. When money runs short it downgrades gracefully and says why. The profile also becomes a live visual signature, a radar chart and a woven thread drawn on canvas that redraws with every slider move.

The dataset is clearly labeled synthetic, and the two seams where the Qloo taste API would plug in are documented in the README. No live API is claimed. Fifty one unit tests cover similarity scoring, itinerary planning, budget handling, and the decision trace.

Built with: vanilla JavaScript, canvas, node:test, and an explainable scoring engine of our own design.

Try it: https://aariv.me/tasteweave/
Code: https://github.com/draarivpatel-ui/tasteweave
