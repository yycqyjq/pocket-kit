import * as N from './numtheory.mjs'

let ok = 0
let fail = 0
export function is(a, b, m) {
  if (a === b) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': got ' + JSON.stringify(a) + ' want ' + JSON.stringify(b))
  }
}
export function near(a, b, m, tol) {
  if (Math.abs(a - b) < (tol || 1e-9)) ok++
  else {
    fail++
    console.log('FAIL ' + m + ': got ' + a + ' want ' + b)
  }
}
export function throws(fn, m) {
  try {
    fn()
    fail++
    console.log('FAIL ' + m + ': should throw')
  } catch (e) {
    if (!e || !e.message) {
      fail++
      console.log('FAIL ' + m + ': empty error')
    } else ok++
  }
}
export function report(name) {
  console.log('== ' + name + ' pass=' + ok + '/' + (ok + fail))
  if (fail) process.exitCode = 1
}
export function raw() {
  return { ok, fail }
}

is(N.hasBigInt, true, 'hasBigInt')
is(N.isPrime(2), true, 'p2')
is(N.isPrime(1), false, 'p1')
is(N.isPrime(0), false, 'p0')
is(N.isPrime(-7), true, 'pneg7')
is(N.isPrime(561), false, 'carmichael561')
is(N.isPrime(104729), true, 'p104729')
is(N.isPrime('999999999999999989'), true, 'bigprime18')
is(N.isPrime('1000000000000000000'), false, 'bigcomp')
is(N.isPrime('100000000000000000000000000000001'), false, 'hugeCompCheck')

is(N.factorize(360).display, '2^3 × 3^2 × 5', 'f360')
is(N.factorize(360).divisorCount, '24', 'tau360')
is(N.factorize(360).sumDivisors, '1170', 'sigma360')
is(N.factorize(97).prime, true, 'f97prime')
is(N.factorize(1).steps.length, 1, 'f1')
is(N.factorize(0).divisorCount, '∞', 'f0inf')
is(N.factorize(0).zero, true, 'f0zero')
is(N.factorize('1105').display, '5 × 13 × 17', 'f1105')
is(N.factorize('2317').display, '7 × 331', 'f2317')
is(N.factorize(49).squareFree, false, 'sq49')
is(N.factorize(6).squareFree, true, 'sq6')
is(N.factorize(360).radical, '30', 'radical360')
is(N.factorize(360).steps.length > 2, true, 'steps360')

is(N.divisors(28).kind, 'perfect', '28perfect')
is(N.divisors(28).list.join(','), '1,2,4,7,14,28', 'd28')
is(N.divisors(12).kind, 'abundant', '12abundant')
is(N.divisors(1).kind, 'deficient', '1deficient')
is(N.divisors(12).count, '6', 'd12count')
is(N.divisors(360).count, '24', 'd360count')
throws(() => N.divisors(0), 'd0throws')
is(N.divisors(28).sumProper, '28', 'proper28')
is(N.isPerfectNumber(496).perfect, true, '496perfect')
is(N.isPerfectNumber(500).perfect, false, '500notperfect')

is(N.gcdAll([12, 18, 24]).result, '6', 'gcd3')
is(N.gcd(84, 36), '12', 'gcd8436')
is(N.lcmAll([4, 6, 10]).result, '60', 'lcm3')
is(N.lcm(0, 5), '0', 'lcm0')
is(N.lcm(21, 6), '42', 'lcm216')
is(N.gcdAll('1440 2520').result, '360', 'gcdSpaceStr')
is(N.coprime(9, 28).yes, true, 'cop928')
is(N.coprime(12, 18).yes, false, 'nocop')
is(N.coprime(17, 31).sharedFactors.length, 0, 'copnone')

is(N.phi(36).result, '12', 'phi36')
is(N.phi(1).result, '1', 'phi1')
is(N.phi(97).result, '96', 'phiPrime97')
is(N.phi(1000000007).result, '1000000006', 'phiPrimeBig')
throws(() => N.phi(0), 'phi0')

is(N.primeNeighbors(10).prev, '7', 'pnPrev')
is(N.primeNeighbors(10).next, '11', 'pnNext')
is(N.primeNeighbors(11).twin, true, 'twin11')
is(N.primeNeighbors(89).next, '97', 'pn90')
is(N.nthPrime(1), 2, 'nth1')
is(N.nthPrime(10000), 104729, 'nth10000')
is(N.nthPrime(6), 13, 'nth6')
is(N.sievePrimes(30).join(','), '2,3,5,7,11,13,17,19,23,29', 'sieve30')
is(N.primeCountUpTo(100).count, 25, 'pi100')
is(N.primeCountUpTo(1000).count, 168, 'pi1000')
is(N.primeCountUpTo(1).count, 0, 'pi1')

is(N.digitInfo(255, 16).repr, 'ff', 'hex255')
is(N.digitInfo(255, 16).digitSum, '1e', 'ds255hex')
is(N.digitInfo(12345, 10).digitSum, '15', 'ds12345')
is(N.digitInfo(999, 10).digitalRoot, '9', 'dr999')
is(N.digitInfo('12345678901234567890', 10).digitSum, '90', 'dsBig')
is(N.digitInfo(255, 2).repr, '11111111', 'bin255')
is(N.digitInfo(8, 16).rootByFormula, '8', 'rootFormula')
throws(() => N.digitInfo(10, 99), 'baseRange')
is(N.digitInfo(0, 10).repr, '0', 'zeroRepr')

is(N.toRoman(1990).roman, 'MCMXC', 'r1990')
is(N.toRoman(4).roman, 'IV', 'r4')
is(N.toRoman(3999).roman, 'MMMCMXCIX', 'r3999')
is(N.toRoman(2026).roman, 'MMXXVI', 'r2026')
throws(() => N.toRoman(4000), 'r4000')
throws(() => N.toRoman(0), 'r0')
is(N.fromRoman('MCMXC').value, 1990, 'fr1990')
is(N.fromRoman('IIII').strict, false, 'frIIII')
is(N.fromRoman('mcmxc').value, 1990, 'frLower')
is(N.fromRoman('MMXXVI').value, 2026, 'fr2026')
throws(() => N.fromRoman('ABC'), 'frBad')
throws(() => N.fromRoman(''), 'frEmpty')

is(N.amicablePair(220, 284).yes, true, 'amicable')
is(N.amicablePair(220, 220).yes, false, 'selfPair')
is(N.amicablePair(1184, 1210).yes, true, 'amicable2')
is(N.amicablePairsUpTo(10000)[0].a, 220, 'amicableList')

is(N.powerCheck(1024).powerOf2, true, 'pow2')
is(N.powerCheck(1024).exponentOf2, '10', 'pow2exp')
is(N.powerCheck(1000).powerOf10, true, 'pow10')
is(N.powerCheck(100000).powerOf10, true, 'pow10e5')
is(N.powerCheck(1001).powerOf10, false, 'pow10no')
is(N.placeValue(2025).rows.length, 3, 'placeValue')

throws(() => N.toInt('1.5'), 'rejectFloat')
throws(() => N.toInt(''), 'rejectEmpty')
throws(() => N.toInt('12a'), 'rejectAlpha')

// 随机往返：分解结果乘回去必须等于原数，且每个因子都是素数
function prod(factors) {
  if (N.hasBigInt) return factors.reduce((a, f) => a * BigInt(f.prime) ** BigInt(f.exp), 1n).toString()
  return String(factors.reduce((a, f) => a * Math.pow(f.primeNum, f.exp), 1))
}
const samples = [1n * 99991n * 99989n, 2n ** 31n - 1n, 123456789n, 999999999999999n, 1000003n * 1000033n, 60n, 969969n]
for (const s of samples) {
  const f = N.factorize(s.toString())
  is(prod(f.factors), s.toString(), 'roundtrip ' + s)
  f.factors.forEach((x) => is(N.isPrime(x.prime), true, 'factorPrime ' + x.prime))
}
report('numtheory')
