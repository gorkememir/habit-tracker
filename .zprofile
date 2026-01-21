
eval "$(/opt/homebrew/bin/brew shellenv)"
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"

autoload -Uz vcs_info
precmd() { vcs_info }
setopt prompt_subst
PROMPT='%F{green}%n@%m%f %F{blue}%~%f %F{yellow}${vcs_info_msg_0_}%f %# '

zstyle ':vcs_info:git:*' formats '(%b)'

alias zpr="code ~/.zprofile"
alias szpr="source ~/.zprofile"

alias tf="terraform"
alias tfa="terraform apply"
alias tfat="terraform apply -target"
alias tfp="terraform fmt && terraform plan"
alias tfpt="terraform plan -target"
alias tfpg="terraform plan | grep"
alias tfpgd="terraform plan | grep destroyed"
alias tfps="terraform plan | grep 'will be'"
alias tfi="terraform init"
alias tfo="terraform output"
alias tfw="terraform workspace"
alias tfs="terraform state"
alias tfr="terraform refresh"
alias tfsl="terraform state list"
alias tfss="terraform state show"
alias tfslg="terraform state list | grep"
alias tfws="terraform workspace select"
alias twl="terraform workspace list"
alias tws="terraform workspace select sandbox"
alias twd="terraform workspace select development"
alias tfv="terraform validate"

alias gcb='git checkout -b'
alias gcam='git commit -am'
alias gs='git switch'
alias ga='git add .'
alias glb='git switch -'
alias rr='cd "$(git rev-parse --show-toplevel)"'
alias cp='gcam "checkpoint"'
alias rc='gcam "resolve conflicts"'

alias pcra='pre-commit run --all-files --show-diff-on-failure'

export API_TOKEN="token_value_here"

gcbp() {
    git checkout -b PLAT-"$1"
}

gsp() {
    git switch PLAT-"$1"
}

git_clean_main () {
    git fetch origin                   # Fetch latest changes from remote
    git checkout main                  # Switch to main branch
    git reset --hard origin/main       # Reset local main to match remote
    git clean -fd                      # Remove untracked files and directories
}

cpr() {
    pr_title="$1"
    if [[ -z "$pr_title" ]]; then
        read "pr_title?PR title: "
    fi
    branchname="$(git branch --show-current)"
    pr_desc="Closes $branchname"
    git push -u origin "$branchname" && \
    gh pr create --title "$pr_title" --body "$pr_desc" --fill
}

ub () {
    git switch main
    git pull
    git switch -
    git merge main
}

connect_sp () {
    ssh -L 5433:{RDS_URL}:5432 gorkem@bastion -i ~/.ssh/ec2.pem
}

upapp() {
    git pull --no-rebase
    gcam "$1"
    git push
}