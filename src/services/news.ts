import { DaemoFunction } from "daemo-engine";
import { z } from "zod";

export class NewsService {
    private static readonly newsApiKey = process.env.NEWS_API_KEY;
    private static readonly newsApiUrl = 'https://newsapi.org/v2';

    @DaemoFunction({
        description: "Search through millions of news articles and return the most relevant ones. IMPORTANT: Some results may be irrelevant to the user's query, so you must filter out irrelevant results.",
        inputSchema: z.object({
            q: z.array(z.string()).describe("Keywords or phrases to search for in the article title and body"),
            searchIn: z.array(z.enum(["title", "description", "content"])).default(["title", "description", "content"]).describe("Fields to search in"),
            from: z.string().describe("Date in YYYY-MM-DD format to start searching from").optional(),
            to: z.string().describe("Date in YYYY-MM-DD format to end searching at. Defaults to current date.").optional(),
            sortBy: z.union([
                z.literal("relevancy").describe("Articles more closely related to the search query come first"),
                z.literal("popularity").describe("Articles from popular sources and publishers come first"),
                z.literal("publishedAt").describe("Newest articles come first (default)")
            ]).default("publishedAt").describe("The order to sort the articles in"),
            results: z.number().min(1).max(100).default(10).describe("The number of news results to return"),
        }),
        outputSchema: z.object({
            articles: z.array(z.object({
                author: z.string().describe("The author of the article"),
                title: z.string().describe("The title of the article"),
                description: z.string().describe("A brief description of the article"),
                url: z.string().describe("The URL of the article"),
                source: z.string().describe("The source of the article"),
                publishedAt: z.string().describe("The date and time the article was published"),
                content: z.string().describe("The first few sentences of the article"),
            }))
        })
    })
    async searchNews(args: { q: string[], searchIn: string[], from: string, to: string, sortBy: string, results: number }) {
        const { q, searchIn, from, to, sortBy, results } = args;
        const params = new URLSearchParams();
        params.append('q', q.join(' '));
        params.append('searchIn', searchIn.join(','));
        if (from && /^\d{4}-\d{2}-\d{2}$/.test(from))
            params.append('from', from);
        if (to && /^\d{4}-\d{2}-\d{2}$/.test(to))
            params.append('to', to);
        params.append('sortBy', sortBy);
        params.append('pageSize', results.toString());
        params.append('language', 'en'); // English news articles by default
        
        const response = await fetch(`${NewsService.newsApiUrl}/everything?${params.toString()}`, {
            method: 'GET',
            headers: {'X-Api-Key': NewsService.newsApiKey}
        });
        if (!response.ok)
            return {status: 'error', message: response.statusText};
        const data = await response.json();
        const articles = (data as any).articles.map((article: any) => ({
            author: article.author,
            title: article.title,
            description: article.description,
            url: article.url,
            source: article.source.name,
            publishedAt: article.publishedAt,
            content: article.content,
        }));
        console.log(articles);
        console.log(`Recieved request for ${results} articles`);
        console.log(`Returning ${articles.length} articles`);
        return {articles};
    }

    @DaemoFunction({
        description: "Get the current date, time, and weekday. Use this function for date or time sensitive queries, instead of assuming or guessing the date or time.",
        inputSchema: z.object({}),
        outputSchema: z.object({
            date: z.string().describe("Current date in YYYY-MM-DD format"),
            time: z.string().describe("Current time in HH:MM:SS format (24-hour)"),
            weekday: z.string().describe("Current day of the week (e.g., Monday, Tuesday)")
        })
    })
    async currentDatetime() {
        const now = new Date();
        const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const date = now.toISOString().split('T')[0];
        const time = now.toTimeString().split(' ')[0];
        const weekday = weekdays[now.getDay()];
        return {
            date,
            time,
            weekday
        };
    }
}