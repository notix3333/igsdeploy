import { parse } from "smol-toml";

import day01 from "../../assets/content/days/day_01.toml?raw";
import day02 from "../../assets/content/days/day_02.toml?raw";
import day03 from "../../assets/content/days/day_03.toml?raw";
import type { DeskDay } from "../types/content";

const sources = [day01, day02, day03];

export const deskDays = sources
  .map((source) => parse(source) as unknown as DeskDay)
  .sort((left, right) => left.day - right.day);
