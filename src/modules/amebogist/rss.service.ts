

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IPost, Post } from './schemas/post.schema';
import { RedisService } from '../../database/redis.service';

const SITE_URL = 'https://amebogist.ng';
const SITE_NAME = 'AmeboGist — Nigeria\'s #1 Pidgin English Gist Platform';
const SITE_DESCRIPTION = "Hot gist, breaking news, AI & Tech, Politics, Entertainment — in Pidgin English wey make sense. Trusted by 12,000+ Nigerian hustlers.";
const RSS_CACHE_TTL = 900; 
 
 interface RssArticle {
    slug: string;
    title: string;
    excerpt: string;
    category: string;
    author?: {
        name: string;
    };
    media?: {
        featuredImage?: string;
    };
    publishedAt?: Date;
}


@Injectable()
export class RssService {
    constructor(
       @InjectModel('Post') private readonly postModel: Model<IPost>,
    private readonly redis: RedisService,
    ) { }

    async generateMainFeed(): Promise<string> {
        const cacheKey = 'rss:main';
        const cached = await this.redis.get(cacheKey);
        if (cached) return cached;

        const articles = await this.postModel
            .find({ status: 'published' })
            .select('slug title excerpt content.pidgin category author.name media.featuredImage publishedAt')
            .sort({ publishedAt: -1 })
            .limit(30)
            .lean();

        const xml = this.buildRssXml({
            title: SITE_NAME,
            link: SITE_URL,
            description: SITE_DESCRIPTION,
            feedUrl: `${SITE_URL}/api/amebogist/rss`,
            articles,
        });

        await this.redis.setex(cacheKey, RSS_CACHE_TTL, xml);
        return xml;
    }

    async generateCategoryFeed(category: string): Promise<string> {
        const cacheKey = `rss:category:${category}`;
        const cached = await this.redis.get(cacheKey);
        if (cached) return cached;

        const articles = await this.postModel
            .find({ status: 'published', category })
            .select('slug title excerpt content.pidgin category author.name media.featuredImage publishedAt')
            .sort({ publishedAt: -1 })
            .limit(20)
            .lean();

        const xml = this.buildRssXml({
            title: `${SITE_NAME} — ${this.capitalise(category)}`,
            link: `${SITE_URL}/category/${category}`,
            description: `Latest ${category} gist from AmeboGist`,
            feedUrl: `${SITE_URL}/api/amebogist/rss/${category}`,
            articles,
        });

        await this.redis.setex(cacheKey, RSS_CACHE_TTL, xml);
        return xml;
    }

    private buildRssXml(params: {
        title: string;
        link: string;
        description: string;
        feedUrl: string;
        articles: RssArticle[];
    }): string {
        const { title, link, description, feedUrl, articles } = params;

        const items = articles
            .map((article) => {
                const articleUrl = `${SITE_URL}/${article.slug}`;
                const pubDate = article.publishedAt
                    ? new Date(article.publishedAt).toUTCString()
                    : new Date().toUTCString();

                const image = article.media?.featuredImage
                    ? `<enclosure url="${this.escapeXml(article.media.featuredImage)}" type="image/jpeg"/>`
                    : '';

                return `
    <item>
      <title><![CDATA[${article.title}]]></title>
      <link>${articleUrl}</link>
      <description><![CDATA[${article.excerpt}]]></description>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="true">${articleUrl}</guid>
      <dc:creator><![CDATA[${article.author?.name ?? 'AmeboGist'}]]></dc:creator>
      <category><![CDATA[${article.category}]]></category>
      ${image}
    </item>`;
            })
            .join('');

        return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title><![CDATA[${title}]]></title>
    <link>${link}</link>
    <description><![CDATA[${description}]]></description>
    <language>en-NG</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>
    <image>
      <url>${SITE_URL}/icons/icon-192x192.png</url>
      <title>${title}</title>
      <link>${link}</link>
    </image>
    ${items}
  </channel>
</rss>`;
    }

    private escapeXml(str: string): string {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    private capitalise(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1).replace(/-/g, ' ');
    }
}