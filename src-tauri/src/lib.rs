use serde::{Deserialize, Serialize};
use std::process::Command;

// ─── Data Structures ────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkflowRun {
    pub id: u64,
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub head_branch: String,
    pub head_sha: String,
    pub created_at: String,
    pub updated_at: String,
    pub html_url: String,
    pub run_number: u64,
    pub event: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkflowJob {
    pub id: u64,
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub steps: Vec<JobStep>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JobStep {
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub number: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GhAuthStatus {
    pub logged_in: bool,
    pub username: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RepoInfo {
    pub full_name: String,
    pub private: bool,
    pub has_actions: bool,
    pub default_branch: String,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AddRepoResult {
    pub success: bool,
    pub message: String,
    pub repo_info: Option<RepoInfo>,
}

// ─── Tauri Commands ─────────────────────────────────────────────────

/// Check if `gh` CLI is installed and user is logged in
#[tauri::command]
fn check_gh_auth() -> Result<GhAuthStatus, String> {
    // Check if gh is installed
    let gh_check = Command::new("gh")
        .arg("--version")
        .output()
        .map_err(|_| "gh CLI is not installed. Please install it from https://cli.github.com".to_string())?;

    if !gh_check.status.success() {
        return Ok(GhAuthStatus {
            logged_in: false,
            username: None,
        });
    }

    // Check auth status
    let auth_output = Command::new("gh")
        .args(["auth", "status", "--active"])
        .output()
        .map_err(|e| format!("Failed to check auth status: {}", e))?;

    let stderr = String::from_utf8_lossy(&auth_output.stderr).to_string();
    let stdout = String::from_utf8_lossy(&auth_output.stdout).to_string();
    let combined = format!("{}{}", stdout, stderr);

    if auth_output.status.success() || combined.contains("Logged in to") {
        // Try to extract username
        let username = extract_username(&combined);
        Ok(GhAuthStatus {
            logged_in: true,
            username,
        })
    } else {
        Ok(GhAuthStatus {
            logged_in: false,
            username: None,
        })
    }
}

fn extract_username(text: &str) -> Option<String> {
    // Look for "Logged in to github.com account <username>"
    // or "account <username>"
    for line in text.lines() {
        if let Some(pos) = line.find("account ") {
            let rest = &line[pos + 8..];
            let username: String = rest.chars()
                .take_while(|c| !c.is_whitespace() && *c != '(' && *c != ')')
                .collect();
            if !username.is_empty() {
                return Some(username);
            }
        }
    }
    None
}

/// Check if a repository exists and has GitHub Actions
#[tauri::command]
fn check_repo(repo: String) -> Result<RepoInfo, String> {
    let output = Command::new("gh")
        .args(["repo", "view", &repo, "--json", "nameWithOwner,isPrivate,defaultBranchRef,description"])
        .output()
        .map_err(|e| format!("Failed to check repository: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("not found") || stderr.contains("Could not resolve") {
            return Err(format!("Repository '{}' not found or you don't have access.", repo));
        }
        return Err(format!("Error checking repository: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let json: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse repo info: {}", e))?;

    let full_name = json["nameWithOwner"].as_str().unwrap_or(&repo).to_string();
    let private = json["isPrivate"].as_bool().unwrap_or(false);
    let description = json["description"].as_str().map(|s| s.to_string());
    let default_branch = json["defaultBranchRef"]["name"].as_str().unwrap_or("main").to_string();

    // Check if repo has actions by listing workflows
    let wf_output = Command::new("gh")
        .args(["api", &format!("repos/{}/actions/workflows", full_name), "--jq", ".total_count"])
        .output()
        .map_err(|e| format!("Failed to check workflows: {}", e))?;

    let wf_count: i32 = String::from_utf8_lossy(&wf_output.stdout)
        .trim()
        .parse()
        .unwrap_or(0);

    Ok(RepoInfo {
        full_name,
        private,
        has_actions: wf_count > 0,
        default_branch,
        description,
    })
}

/// Get workflow runs for a repository
#[tauri::command]
fn get_workflow_runs(repo: String, limit: Option<u32>) -> Result<Vec<WorkflowRun>, String> {
    let limit = limit.unwrap_or(20);
    let output = Command::new("gh")
        .args([
            "api",
            &format!("repos/{}/actions/runs?per_page={}", repo, limit),
            "--jq",
            ".workflow_runs[] | {id, name, status, conclusion, head_branch, head_sha: .head_sha[0:7], created_at, updated_at, html_url, run_number, event}",
        ])
        .output()
        .map_err(|e| format!("Failed to get workflow runs: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to fetch runs: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut runs: Vec<WorkflowRun> = Vec::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        match serde_json::from_str::<WorkflowRun>(line) {
            Ok(run) => runs.push(run),
            Err(_) => continue,
        }
    }

    Ok(runs)
}

/// Get jobs for a specific workflow run
#[tauri::command]
fn get_run_jobs(repo: String, run_id: u64) -> Result<Vec<WorkflowJob>, String> {
    let output = Command::new("gh")
        .args([
            "api",
            &format!("repos/{}/actions/runs/{}/jobs", repo, run_id),
            "--jq",
            ".jobs[] | {id, name, status, conclusion, started_at, completed_at, steps: [.steps[] | {name, status, conclusion, number}]}",
        ])
        .output()
        .map_err(|e| format!("Failed to get jobs: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to fetch jobs: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut jobs: Vec<WorkflowJob> = Vec::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        match serde_json::from_str::<WorkflowJob>(line) {
            Ok(job) => jobs.push(job),
            Err(_) => continue,
        }
    }

    Ok(jobs)
}

/// Get logs for a specific job
#[tauri::command]
fn get_job_logs(repo: String, job_id: u64) -> Result<String, String> {
    let output = Command::new("gh")
        .args([
            "api",
            &format!("repos/{}/actions/jobs/{}/logs", repo, job_id),
        ])
        .output()
        .map_err(|e| format!("Failed to get logs: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to fetch logs: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(stdout)
}

/// Re-run a failed workflow
#[tauri::command]
fn rerun_workflow(repo: String, run_id: u64) -> Result<String, String> {
    let output = Command::new("gh")
        .args([
            "run", "rerun",
            &run_id.to_string(),
            "--repo", &repo,
        ])
        .output()
        .map_err(|e| format!("Failed to rerun workflow: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to rerun: {}", stderr));
    }

    Ok("Workflow rerun initiated successfully.".to_string())
}

/// Open gh login in browser
#[tauri::command]
fn gh_login() -> Result<String, String> {
    let output = Command::new("gh")
        .args(["auth", "login", "--web", "--git-protocol", "https"])
        .output()
        .map_err(|e| format!("Failed to initiate login: {}", e))?;

    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();

    Ok(format!("{}{}", stdout, stderr))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            check_gh_auth,
            check_repo,
            get_workflow_runs,
            get_run_jobs,
            get_job_logs,
            rerun_workflow,
            gh_login,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
