const STOP_WORDS = ['the', 'a', 'an', 'is', 'was', 'are', 'were', 'my', 'i', 'me',
                     'it', 'this', 'that', 'and', 'or', 'but', 'in', 'on', 'at',
                     'to', 'for', 'of', 'with', 'near', 'around', 'from'];

const extractKeywords = (text) => {
    if (!text) return [];
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(word => word.length > 2 && !STOP_WORDS.includes(word));
};

const calculateSimilarity = (text1, text2) => {
    const words1 = new Set(extractKeywords(text1));
    const words2 = new Set(extractKeywords(text2));

    if (words1.size === 0 || words2.size === 0) return 0;

    const intersection = [...words1].filter(w => words2.has(w));
    const union = new Set([...words1, ...words2]);

    return intersection.length / union.size;
};

const calculateMatchScore = (item1, item2) => {
    let score = 0;
    const weights = {
        title: 0.35,
        description: 0.25,
        category: 0.20,
        location: 0.20
    };

    score += calculateSimilarity(item1.title, item2.title) * weights.title;
    score += calculateSimilarity(item1.description, item2.description) * weights.description;

    if (item1.category === item2.category) {
        score += weights.category;
    }

    score += calculateSimilarity(item1.location, item2.location) * weights.location;

    return Math.round(score * 100);
};

const findMatches = async (item, allItems) => {
    const oppositeType = item.type === 'lost' ? 'found' : 'lost';
    const candidates = allItems.filter(i =>
        i.type === oppositeType &&
        i.status === 'active' &&
        i._id.toString() !== item._id.toString()
    );

    const matches = candidates
        .map(candidate => ({
            item: candidate,
            score: calculateMatchScore(item, candidate)
        }))
        .filter(m => m.score >= 30)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

    return matches;
};

module.exports = {
    extractKeywords,
    calculateSimilarity,
    calculateMatchScore,
    findMatches
};