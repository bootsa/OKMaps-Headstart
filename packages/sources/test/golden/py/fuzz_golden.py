"""Golden scores from rapidfuzz for test/fuzz.test.ts.

    python test/golden/py/fuzz_golden.py test/golden/fuzz.json.gz
"""
import gzip, json, random, sys
from rapidfuzz import fuzz

random.seed(7)
words = ("climate change adaptation in urban areas a meta analysis of soil microbial communities "
         "érosion côtière Ökologie 气候 变化 ME/CFS ME-CFS chronic fatigue COVID-19 x y z").split()
alphabet = "abcde fgh"


def rand_title():
    return " ".join(random.choice(words) for _ in range(random.randint(0, 14)))


def mutate(s):
    s = list(s)
    for _ in range(random.randint(0, 6)):
        op = random.random()
        if op < 0.3 and s:
            del s[random.randrange(len(s))]
        elif op < 0.6:
            s.insert(random.randint(0, len(s)), random.choice(alphabet))
        elif s:
            s[random.randrange(len(s))] = random.choice(alphabet)
    return "".join(s)


pairs = [("", ""), ("", "a"), ("abc", "abc"), ("ab", "ba"), ("Journal / Paper title", "paper title")]
for _ in range(1500):
    a = rand_title()
    kind = random.random()
    if kind < 0.4:
        b = mutate(a)
    elif kind < 0.7:
        b = rand_title() + " " + a + " " + rand_title()
    else:
        b = rand_title()
    pairs.append((a, b))
for _ in range(300):
    n = random.randint(0, 12)
    pairs.append(("".join(random.choice(alphabet) for _ in range(n)),
                  "".join(random.choice(alphabet) for _ in range(random.randint(0, 12)))))

out = [{"a": a, "b": b, "ratio": fuzz.ratio(a, b), "partial": fuzz.partial_ratio(a, b),
        "token_sort": fuzz.token_sort_ratio(a, b)} for a, b in pairs]
with gzip.open(sys.argv[1], "wt", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False)
print(len(out), "pairs")
