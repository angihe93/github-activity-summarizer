"use client";

import { DefaultBranchResponse, RecentCommitsResponse, RecentReposResponse, Repository, Commit } from "@/app/types/types";
import React, { useEffect } from "react";
import { motion } from "framer-motion";

type RepositoryWithCommitsUrl = Repository & { commitsUrl?: string };

type CommitsWithSummary = { commits: Commit[], summary: string };

type RepoCommits = {
  [repoName: string]: { repo: RepositoryWithCommitsUrl; commitsWithSummary: CommitsWithSummary }
}

export default function GithubActivitySummary() {

  const [companyUrl, setCompanyUrl] = React.useState('');
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [showInvalid, setShowInvalid] = React.useState(false);
  const [recentRepos, setRecentRepos] = React.useState<Repository[] | null>(null);
  const [totalReposCount, setTotalReposCount] = React.useState<number | null>(null);
  const [repoCommits, setRepoCommits] = React.useState<RepoCommits | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const isValidUrl = (url: string): boolean => {
    url = url.trim();
    const regex = /^(https?:\/\/)?github\.com\/(orgs\/)?[a-zA-Z0-9-]+$/;
    return regex.test(url);
  };

  const normalizeGithubOrgUrl = (url: string): string => {
    url = url.trim();
    if (!url.startsWith('https://')) {
      url = 'https://' + url;
    }
    if (url.includes('/orgs/')) {
      return url;
    }
    const match = url.match(/^https:\/\/github\.com\/([^\/]+)$/);
    if (match) {
      return `https://github.com/orgs/${match[1]}`;
    }
    return url;
  }

  const findRecentRepos = async (githubOrgUrl: string): Promise<{ result: RecentReposResponse }> => {
    const response = await fetch('/api/find-recent-repos', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ githubOrgUrl })
    });
    if (!response.ok) {
      setError(`Unable to get recent repos for ${companyUrl}, please check the URL is correct and try again.`);
      return { result: { repositories: [] } };
    }
    return response.json();
  }

  // TODO: get default branch
  const getDefaultBranch = async (repoUrl: string): Promise<{ result: DefaultBranchResponse }> => {
    const response = await fetch('/api/get-repo-default-branch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ repoUrl })
    });
    if (!response.ok) {
      throw new Error(`Error fetching default branch: ${response.statusText}`);
    }
    return response.json();
  }

  const getRecentCommits = async (commitsUrl: string): Promise<{ result: RecentCommitsResponse }> => {
    const response = await fetch('/api/get-recent-commits', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ commitsUrl })
    });
    if (!response.ok) {
      throw new Error(`Error fetching recent commits: ${response.statusText}`);
    }
    return response.json();
  }

  const handleResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidUrl(companyUrl)) {
      setShowInvalid(true);
      return;
    }
    setShowInvalid(false);
    setIsGenerating(true);
    setRecentRepos(null);
    setRepoCommits(null);
    setStatus('');
    setError(null);

    const normalizedUrl = normalizeGithubOrgUrl(companyUrl);
    try {
      const reposResponse = await findRecentRepos(normalizedUrl);
      if (reposResponse.result.repositories.length === 0) {
        return;
      }
      console.log('Recent Repos Response:', reposResponse);
      const validRepoUrlRegex = /^https:\/\/github\.com\/[^\/]+\/[^\/]+$/;
      const validRepos: RepositoryWithCommitsUrl[] = reposResponse.result.repositories.filter(repo => validRepoUrlRegex.test(repo.url));
      setRecentRepos(validRepos);

      const defaultBranchPromises = validRepos.map(repo => getDefaultBranch(repo.url));
      const defaultBranchResponses = await Promise.allSettled(defaultBranchPromises);
      const successfulDefaultBranches = defaultBranchResponses
        .filter((r): r is PromiseFulfilledResult<{ result: DefaultBranchResponse }> => r.status === 'fulfilled')
        .map(r => r.value);
      console.log('Successful Default Branch Responses:', successfulDefaultBranches);

      const repoCommitsLinks = successfulDefaultBranches.map((res, idx) => {
        return `${validRepos[idx].url}/commits/${res.result.defaultBranch}`;
      });
      successfulDefaultBranches.forEach(branchRes => {
        const repo = validRepos.find(r => r.name === branchRes.result.repositoryName);
        if (repo) {
          repo.commitsUrl = `${repo.url}/commits/${branchRes.result.defaultBranch}`;
        }
      });
      setStatus(`Fetching and summarizing commits for ${repoCommitsLinks.length} recent repositories...`);
      setTotalReposCount(repoCommitsLinks.length);
      console.log('Repo Commits Links:', repoCommitsLinks);
      console.log('Valid Repos with Commits URL:', validRepos);

      const commitPromises = repoCommitsLinks.map(async (url) => {
        try {
          const commitsRes = await getRecentCommits(url);
          const repo = validRepos.find(r => r.name === commitsRes.result.repository.name)
          if (repo) {
            setRepoCommits(prev => ({
              ...prev,
              [repo.name]: {
                repo,
                commitsWithSummary: {
                  commits: commitsRes.result.commits ?? [],
                  summary: commitsRes.result.summary
                }
              }
            }));
          }
        } catch (error) {
          console.log(`Failed to get commits for ${url}:`, error);
        }
      });
      await Promise.allSettled(commitPromises);

    } catch (error) {
      console.error('Error during research:', error);
    }
    finally {
      setIsGenerating(false);
      console.log("final repoCommits:", repoCommits);
    }
  }

  useEffect(() => {
    if (!recentRepos || !repoCommits || !totalReposCount) return;
    const newReposOrder = recentRepos.slice().sort((a, b) => {
      const aHasCommits = repoCommits && repoCommits[a.name] && repoCommits[a.name].commitsWithSummary.commits.length > 0 ? 0 : 2;
      const bHasCommits = repoCommits && repoCommits[b.name] && repoCommits[b.name].commitsWithSummary.commits.length > 0 ? 0 : 2;
      let aScore = aHasCommits;
      let bScore = bHasCommits;
      if (aHasCommits === 2) {
        if (repoCommits && repoCommits[a.name] && repoCommits[a.name].commitsWithSummary.summary.length > 0 && !repoCommits[a.name].commitsWithSummary.summary.toLowerCase().startsWith('no'))
          aScore = 1;
      }
      if (bHasCommits === 2) {
        if (repoCommits && repoCommits[b.name] && repoCommits[b.name].commitsWithSummary.summary.length > 0 && !repoCommits[b.name].commitsWithSummary.summary.toLowerCase().startsWith('no'))
          bScore = 1;
      }
      return aScore - bScore;
    })
    setRecentRepos(newReposOrder);
    const summarizedCount = Object.keys(repoCommits).length;
    setStatus(summarizedCount < totalReposCount && isGenerating
      ? `Summarized commits for ${summarizedCount}/${totalReposCount} repositories. ${totalReposCount - summarizedCount} remaining...`
      : `Summarized commits for ${summarizedCount} repositories.`);
  }, [repoCommits]);

  useEffect(() => {
    console.log('recentRepos updated:', recentRepos);
    console.log('repoCommits state:', repoCommits);
  }, [recentRepos])

  return (
    <div>
      <h1 className="md:text-6xl text-4xl pb-5 font-medium opacity-0s animate-in fade-in">
        <span className="text-brand-default"> GitHub Activity Summary </span>
      </h1>
      <p className="mb-8 animate-in fade-in">
        Get the recent activitities of an organization on GitHub with a summary of their latest commits.
        Gain real-time insights into what the company is building.
      </p>

      <form onSubmit={handleResearch}>
        <input
          value={companyUrl}
          onChange={(e) => {
            const val = e.target.value;
            setError(null);
            setCompanyUrl(val);
          }}
          placeholder="Enter organization's GitHub URL (e.g., github.com/exa-labs or github.com/orgs/exa-labs)"
          className="w-full bg-white p-3 border box-border outline-none border-2 border-[var(--brand-default)] resize-none opacity-0s animate-in fade-in"
        />
        {showInvalid && (
          <div className="text-red-500 mt-2">
            Please enter a valid GitHub organization URL, e.g., github.com/exa-labs or github.com/orgs/exa-labs
          </div>
        )}
        <button
          type="submit"
          disabled={isGenerating}
          className="w-full mt-4 mb-6 text-white font-semibold px-2 py-2 min-h-[50px] bg-[var(--brand-default)] cursor-pointer animate-in fade-in"
        >
          {isGenerating ? 'Summarizing...' : 'Summarize Now'}
        </button>
        <div className="flex items-center justify-end gap-2 sm:gap-3 pt-4 opacity-0s animate-in fade-in">
          <span className="text-gray-800">Powered by</span>
          <a
            href="https://exa.ai"
            target="_blank"
            rel="origin"
            className="hover:opacity-80 transition-opacity"
          >
            <img src="/exa_logo.png" alt="Exa Logo" className="h-6 sm:h-7 object-contain" />
          </a>
        </div>
      </form>

      {status && (
        <div className="mt-2 animate-in fade-in">
          {status}
        </div>
      )}
      {error && (
        <div className="text-red-500 mt-2">
          {error}
        </div>
      )}

      {recentRepos && recentRepos.length > 0 && (
        recentRepos
          .map(repo => (
            <motion.div
              key={repo.name}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
              className="border shadow-sm p-4 px-6 my-2 h-70 bg-white overflow-y-auto animate-in fade-in"
            >
              <div className="grid grid-cols-7 gap-6">
                <div className="col-span-2 min-w-0 break-words">
                  <a href={repo.url} target="_blank" rel="noopener noreferrer" className="text-xl font-bold text-blue-600">{repo.name}</a>
                  <p>{repo.description}</p>
                  <p>Last Updated: {new Date(repo.lastUpdated).toLocaleDateString()}</p>
                  <p>Stars: {repo.stars || 0} | Language: {repo.language || 'N/A'}</p>
                </div>
                <div className="col-span-5 min-w-0 overflow-hidden break-words">
                  {repoCommits && repoCommits[repo.name] ?
                    (
                      <div className="mt-2">
                        <h3 className="font-semibold mb-2">Recent Commits:</h3>
                        <p>{repoCommits[repo.name].commitsWithSummary.summary}</p>
                        {repoCommits[repo.name].commitsWithSummary.commits.map(commit => (
                          <div key={commit.id} className="border-t mt-2 pt-2">
                            <a href={commit.url} target="_blank" rel="noopener noreferrer" className="text-blue-600">{commit.message}</a>
                            <p>Author: {commit.author} | Date: {new Date(commit.date).toLocaleString()}</p>
                          </div>
                        ))}
                        {repoCommits[repo.name].commitsWithSummary.commits.length === 0 && repoCommits[repo.name].repo.commitsUrl && (
                          <div className="mt-2">
                            <a href={repoCommits[repo.name].repo.commitsUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600">View commits here</a>
                          </div>
                        )}
                      </div>
                    )
                    : (isGenerating ? (
                      <div className="mt-2 flex-1 min-w-0 w-full">
                        <div className="animate-pulse w-full">
                          <div className="h-6 bg-gray-200 rounded w-1/3 mb-2" />
                          <div className="h-6 bg-gray-200 rounded w-4/5 mb-2" />
                          <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
                          <div className="h-4 bg-gray-200 rounded w-1/2" />
                        </div>
                      </div>

                    ) : <div>failed to get commits details</div>)}
                </div>
              </div>
            </motion.div>
          ))
      )
      }
    </div >
  )
}